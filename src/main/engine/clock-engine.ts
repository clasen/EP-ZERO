import { defaultConfig, defaultStatus } from "../shared/defaults.js";
import { findMatchingMidiOutput } from "../shared/midi-names.js";
import type {
  EpZeroConfig,
  EpZeroStatus,
  LinkSnapshot,
  MidiOutCommand
} from "../shared/types.js";

const MIDI_CLOCKS_PER_BEAT = 24;
const CLOCK_LOOKAHEAD_MS = 6;
const LOST_LINK_AFTER_MS = 750;
const MIN_BPM = 20;
const MAX_BPM = 320;

export class LinkToMidiClockEngine {
  private config: EpZeroConfig;
  private status: EpZeroStatus = { ...defaultStatus };
  private lastLink: LinkSnapshot | null = null;
  private armed = false;
  private scheduledStartAtMs: number | null = null;
  private scheduledStartBeat: number | null = null;
  private running = false;
  private nextClockAtMs: number | null = null;
  private clockCount = 0;

  constructor(config: EpZeroConfig = defaultConfig) {
    this.config = structuredClone(config);
    this.applyConfig(config);
  }

  applyConfig(config: Partial<EpZeroConfig>): EpZeroStatus {
    this.config = {
      ...this.config,
      ...config,
      nudge: { ...this.config.nudge, ...config.nudge }
    };

    this.config.kickOffsetMs = clamp(this.config.kickOffsetMs, -250, 250);
    this.config.quantum = clamp(this.config.quantum, 1, 16);

    this.status = {
      ...this.status,
      selectedMidiOutput: this.config.midiOutputName,
      linkEnabled: this.config.linkEnabled,
      midiClockOutEnabled: this.config.midiClockOutEnabled,
      transportOutEnabled: this.config.transportOutEnabled,
      launchMode: this.config.launchMode,
      quantum: this.config.quantum,
      appliedOffsetMs: this.config.kickOffsetMs,
      warning: midiOutputWarning(this.status.availableMidiOutputs, this.config.midiOutputName),
      appState: this.nextAppState()
    };

    return this.getStatus();
  }

  setAvailableMidiOutputs(outputs: string[]): EpZeroStatus {
    this.status.availableMidiOutputs = outputs;
    const selectedOutput = findMatchingMidiOutput(outputs, this.config.midiOutputName);

    if (selectedOutput) {
      this.config.midiOutputName = selectedOutput;
      this.status.selectedMidiOutput = selectedOutput;
    } else if (!this.config.midiOutputName) {
      this.config.midiOutputName = preferredMidiOutput(outputs);
      this.status.selectedMidiOutput = this.config.midiOutputName;
    } else {
      this.status.selectedMidiOutput = this.config.midiOutputName;
    }

    this.status.warning = midiOutputWarning(outputs, this.config.midiOutputName);
    this.status.appState = this.nextAppState();
    return this.getStatus();
  }

  updateLink(link: LinkSnapshot, receivedAtMs = performance.now()): EpZeroStatus {
    this.lastLink = { ...link, receivedAtMs };
    this.status.linkPeers = link.peers;
    this.status.linkBpm = link.bpm;
    this.status.linkBeat = link.beat;
    this.status.linkPhase = phase(link.beat, this.config.quantum);
    this.status.linkPlaying = link.playing;
    this.status.clockQuality = "Stable";
    this.status.warning = link.warning ?? midiOutputWarning(this.status.availableMidiOutputs, this.config.midiOutputName);
    this.status.appState = this.nextAppState();
    return this.getStatus();
  }

  arm(nowMs = performance.now()): EpZeroStatus {
    if (this.selectedOutputBlocked()) {
      this.status.warning = midiOutputWarning(this.status.availableMidiOutputs, this.config.midiOutputName);
      this.status.appState = this.nextAppState();
      return this.getStatus();
    }

    this.armed = true;
    const launch = this.computeLaunch(nowMs);
    this.scheduledStartAtMs = launch?.startAtMs ?? null;
    this.scheduledStartBeat = launch?.startBeat ?? null;
    this.status.nextLaunchAtMs = this.scheduledStartAtMs;
    this.status.appState = this.nextAppState();
    return this.getStatus();
  }

  startNow(nowMs = performance.now()): EpZeroStatus {
    if (this.selectedOutputBlocked()) {
      this.status.warning = midiOutputWarning(this.status.availableMidiOutputs, this.config.midiOutputName);
      this.status.appState = this.nextAppState();
      return this.getStatus();
    }

    this.armed = true;
    this.scheduledStartAtMs = Math.max(nowMs, nowMs + this.config.kickOffsetMs);
    this.scheduledStartBeat = null;
    this.status.nextLaunchAtMs = this.scheduledStartAtMs;
    this.status.appState = this.nextAppState();
    return this.getStatus();
  }

  stop(): MidiOutCommand[] {
    this.armed = false;
    this.scheduledStartAtMs = null;
    this.scheduledStartBeat = null;
    this.status.nextLaunchAtMs = null;
    this.running = false;
    this.nextClockAtMs = null;
    this.clockCount = 0;
    this.status.transportState = "stopped";
    this.status.lastMidiMessage = this.config.transportOutEnabled ? "stop" : this.status.lastMidiMessage;
    this.status.appState = this.nextAppState();
    return this.config.transportOutEnabled ? [{ type: "stop" }] : [];
  }

  resync(nowMs = performance.now()): EpZeroStatus {
    this.running = false;
    this.nextClockAtMs = null;
    this.clockCount = 0;
    return this.arm(nowMs);
  }

  nudge(deltaMs: number): EpZeroStatus {
    this.applyConfig({ kickOffsetMs: this.config.kickOffsetMs + deltaMs });
    return this.getStatus();
  }

  tick(nowMs = performance.now()): MidiOutCommand[] {
    const commands: MidiOutCommand[] = [];
    if (this.selectedOutputBlocked()) {
      this.status.warning = midiOutputWarning(this.status.availableMidiOutputs, this.config.midiOutputName);
      this.status.appState = this.nextAppState();
      return commands;
    }

    this.refreshDerivedStatus(nowMs);

    if (this.shouldStart(nowMs)) {
      const startFromBeatBoundary =
        this.scheduledStartBeat !== null && this.projectBeat(nowMs) >= this.scheduledStartBeat;
      this.armed = false;
      this.running = true;
      this.clockCount = 0;
      this.status.transportState = "running";
      this.status.lastMidiMessage = "start";
      if (this.config.transportOutEnabled) commands.push({ type: "start" });
      this.nextClockAtMs = startFromBeatBoundary ? nowMs : this.scheduledStartAtMs;
      this.scheduledStartAtMs = null;
      this.scheduledStartBeat = null;
      this.status.nextLaunchAtMs = null;
    }

    if (this.running && this.config.midiClockOutEnabled) {
      const intervalMs = this.clockIntervalMs();
      while (this.nextClockAtMs !== null && nowMs + CLOCK_LOOKAHEAD_MS >= this.nextClockAtMs) {
        commands.push({ type: "clock" });
        this.status.lastMidiMessage = "clock";
        this.clockCount += 1;
        this.nextClockAtMs += intervalMs;
      }
    }

    this.status.appState = this.nextAppState();
    return commands;
  }

  getConfig(): EpZeroConfig {
    return structuredClone(this.config);
  }

  getStatus(): EpZeroStatus {
    return structuredClone(this.status);
  }

  private refreshDerivedStatus(nowMs: number): void {
    if (!this.lastLink) {
      this.status.clockQuality = "Lost";
      this.status.appState = this.nextAppState();
      return;
    }

    const ageMs = nowMs - this.lastLink.receivedAtMs;
    if (ageMs > LOST_LINK_AFTER_MS) {
      this.status.clockQuality = "Lost";
      this.status.appState = this.nextAppState();
      return;
    }

    const projectedBeat = this.projectBeat(nowMs);
    this.status.linkBeat = projectedBeat;
    this.status.linkPhase = phase(projectedBeat, this.config.quantum);
    this.status.linkBpm = this.lastLink.bpm;
    this.status.linkPlaying = this.lastLink.playing;
    this.status.clockQuality = "Stable";
    this.status.nextLaunchAtMs = this.scheduledStartAtMs;
  }

  private computeLaunch(nowMs: number): { startAtMs: number; startBeat: number } | null {
    if (!this.lastLink || !validBpm(this.lastLink.bpm)) return null;
    const currentBeat = this.projectBeat(nowMs);
    const targetBeat = nextBoundaryBeat(currentBeat, this.launchQuantum());
    const beatMs = 60000 / this.lastLink.bpm;
    const offsetBeats = this.config.kickOffsetMs / beatMs;
    return {
      startAtMs: nowMs + (targetBeat - currentBeat) * beatMs + this.config.kickOffsetMs,
      startBeat: targetBeat + offsetBeats
    };
  }

  private shouldStart(nowMs: number): boolean {
    if (this.scheduledStartAtMs === null) return false;
    if (nowMs + CLOCK_LOOKAHEAD_MS >= this.scheduledStartAtMs) return true;
    if (this.scheduledStartBeat === null) return false;
    return this.projectBeat(nowMs) >= this.scheduledStartBeat;
  }

  private projectBeat(nowMs: number): number {
    if (!this.lastLink || !validBpm(this.lastLink.bpm)) return 0;
    return this.lastLink.beat + (nowMs - this.lastLink.receivedAtMs) / (60000 / this.lastLink.bpm);
  }

  private clockIntervalMs(): number {
    const bpm = this.lastLink?.bpm ?? this.status.linkBpm;
    if (!validBpm(bpm)) return 60000 / 120 / MIDI_CLOCKS_PER_BEAT;
    return 60000 / bpm / MIDI_CLOCKS_PER_BEAT;
  }

  private launchQuantum(): number {
    if (this.config.launchMode === "next_beat") return 1;
    if (this.config.launchMode === "next_4_bar_phrase") return this.config.quantum * 4;
    return this.config.quantum;
  }

  private nextAppState(): EpZeroStatus["appState"] {
    if (!this.config.linkEnabled) return "NO_LINK_SESSION";
    if (!this.lastLink) return "NO_LINK_SESSION";
    if (this.status.clockQuality === "Lost") return "CLOCK_LOST";
    if (!this.config.midiOutputName) return "NO_MIDI_OUTPUT";
    if (this.selectedOutputBlocked()) return "ERROR";
    if (this.running) return "RUNNING";
    if (this.armed && this.scheduledStartAtMs !== null) return "WAITING_FOR_BOUNDARY";
    if (this.armed) return "ARMED";
    return "MIDI_READY";
  }

  private selectedOutputBlocked(): boolean {
    return isMoveNonStandalonePort(this.config.midiOutputName);
  }
}

function nextBoundaryBeat(beat: number, quantum: number): number {
  const boundary = Math.floor(beat / quantum + 1) * quantum;
  return boundary === beat ? beat + quantum : boundary;
}

function phase(beat: number, quantum: number): number {
  return positiveModulo(beat, quantum);
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function validBpm(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_BPM && value <= MAX_BPM;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function preferredMidiOutput(outputs: string[]): string {
  return outputs.find(isMoveStandalonePort)
    ?? outputs.find((output) => !isVirtualMidiPort(output) && !isMoveNonStandalonePort(output))
    ?? outputs.find((output) => !isVirtualMidiPort(output))
    ?? outputs[0]
    ?? "";
}

function midiOutputWarning(outputs: string[], selectedOutput: string): string | null {
  void outputs;
  void selectedOutput;
  return null;
}

function isAbletonMovePort(output: string): boolean {
  return /ableton\s+move/i.test(output);
}

function isMoveStandalonePort(output: string): boolean {
  return /ableton\s+move.*standalone\s+port/i.test(output);
}

function isMoveNonStandalonePort(output: string): boolean {
  return isAbletonMovePort(output) && !isMoveStandalonePort(output);
}

function isVirtualMidiPort(output: string): boolean {
  return /virtual|iac|network session/i.test(output);
}
