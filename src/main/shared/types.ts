export type AppState =
  | "NO_LINK_SESSION"
  | "LINK_CONNECTED"
  | "NO_MIDI_OUTPUT"
  | "MIDI_READY"
  | "ARMED"
  | "WAITING_FOR_BOUNDARY"
  | "RUNNING"
  | "STOPPED"
  | "CLOCK_LOST"
  | "ERROR";

export type ClockQuality = "Stable" | "Jittery" | "Lost";
export type TransportState = "stopped" | "running" | "continued";
export type MidiMessageType = "clock" | "start" | "stop" | "continue";
export type LaunchMode = "next_beat" | "next_bar" | "next_4_bar_phrase";

export interface EpZeroConfig {
  midiOutputName: string;
  linkEnabled: boolean;
  startStopSyncEnabled: boolean;
  midiClockOutEnabled: boolean;
  transportOutEnabled: boolean;
  launchMode: LaunchMode;
  quantum: number;
  kickOffsetMs: number;
  nudge: {
    fineMs: number;
    coarseMs: number;
  };
}

export interface LinkSnapshot {
  bpm: number;
  beat: number;
  phase: number;
  peers: number;
  playing: boolean;
  receivedAtMs: number;
  warning: string | null;
}

export interface EpZeroStatus {
  appState: AppState;
  clockQuality: ClockQuality;
  selectedMidiOutput: string;
  availableMidiOutputs: string[];
  lastMidiMessage: MidiMessageType | "none";
  linkBpm: number;
  linkBeat: number;
  linkPhase: number;
  linkPeers: number;
  linkEnabled: boolean;
  linkPlaying: boolean;
  startStopSyncEnabled: boolean;
  midiClockOutEnabled: boolean;
  transportOutEnabled: boolean;
  transportState: TransportState;
  launchMode: LaunchMode;
  quantum: number;
  appliedOffsetMs: number;
  nextLaunchAtMs: number | null;
  warning: string | null;
}

export type MidiOutCommand = { type: MidiMessageType };

export interface AppSnapshot {
  config: EpZeroConfig;
  status: EpZeroStatus;
}

export interface EpZeroApi {
  getSnapshot(): Promise<AppSnapshot>;
  listMidiOutputs(): Promise<string[]>;
  setConfig(config: Partial<EpZeroConfig>): Promise<AppSnapshot>;
  selectMidiOutput(name: string): Promise<AppSnapshot>;
  arm(): Promise<AppSnapshot>;
  startNow(): Promise<AppSnapshot>;
  stop(): Promise<AppSnapshot>;
  nudge(deltaMs: number): Promise<AppSnapshot>;
  resync(): Promise<AppSnapshot>;
  onStatus(listener: (snapshot: AppSnapshot) => void): () => void;
}
