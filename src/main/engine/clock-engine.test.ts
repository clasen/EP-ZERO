import { describe, expect, it } from "vitest";
import { LinkToMidiClockEngine } from "./clock-engine.js";
import { defaultConfig } from "../shared/defaults.js";

describe("LinkToMidiClockEngine", () => {
  it("projects Link beat and phase from BPM updates", () => {
    const engine = new LinkToMidiClockEngine(defaultConfig);
    engine.updateLink({ bpm: 120, beat: 8, phase: 0, peers: 1, playing: true, receivedAtMs: 1000, warning: null }, 1000);

    engine.tick(1500);
    const status = engine.getStatus();

    expect(status.linkBpm).toBe(120);
    expect(status.linkBeat).toBeCloseTo(9, 2);
    expect(status.linkPhase).toBeCloseTo(1, 2);
    expect(status.linkPlaying).toBe(true);
  });

  it("arms the USB MIDI output for the next bar plus kick offset", () => {
    const engine = new LinkToMidiClockEngine({
      ...defaultConfig,
      midiOutputName: "USB MIDI Device",
      kickOffsetMs: -18,
      launchMode: "next_bar"
    });
    engine.updateLink({ bpm: 120, beat: 10.5, phase: 2.5, peers: 1, playing: true, receivedAtMs: 1000, warning: null }, 1000);

    engine.arm(1000);
    const status = engine.getStatus();

    expect(status.appState).toBe("WAITING_FOR_BOUNDARY");
    expect(status.nextLaunchAtMs).toBeCloseTo(1732, 0);
  });

  it("emits start followed by 24 PPQN clock messages", () => {
    const engine = new LinkToMidiClockEngine({ ...defaultConfig, midiOutputName: "USB MIDI Device", launchMode: "next_bar" });
    engine.updateLink({ bpm: 120, beat: 4, phase: 0, peers: 1, playing: true, receivedAtMs: 1000, warning: null }, 1000);
    engine.startNow(1000);

    const first = engine.tick(1000);
    expect(first.map((command) => command.type)).toEqual(["start", "clock"]);

    const interval = 60000 / 120 / 24;
    const next = engine.tick(1000 + interval);
    expect(next.map((command) => command.type)).toEqual(["clock"]);
  });

  it("starts when Link beat crosses the scheduled boundary even if the wall timer is late", () => {
    const engine = new LinkToMidiClockEngine({ ...defaultConfig, midiOutputName: "USB MIDI Device", launchMode: "next_bar" });
    engine.updateLink({ bpm: 120, beat: 10.5, phase: 2.5, peers: 1, playing: true, receivedAtMs: 1000, warning: null }, 1000);
    engine.arm(1000);

    engine.updateLink({ bpm: 120, beat: 12.01, phase: 0.01, peers: 1, playing: true, receivedAtMs: 1200, warning: null }, 1200);
    const commands = engine.tick(1200);

    expect(commands.map((command) => command.type)).toEqual(["start", "clock"]);
    expect(engine.getStatus().appState).toBe("RUNNING");
  });

  it("does not send transport messages when transport out is disabled", () => {
    const engine = new LinkToMidiClockEngine({
      ...defaultConfig,
      midiOutputName: "USB MIDI Device",
      transportOutEnabled: false
    });
    engine.updateLink({ bpm: 120, beat: 4, phase: 0, peers: 1, playing: true, receivedAtMs: 1000, warning: null }, 1000);
    engine.startNow(1000);

    expect(engine.tick(1000).map((command) => command.type)).toEqual(["clock"]);
    expect(engine.stop()).toEqual([]);
  });

  it("keeps the running MIDI clock stable when kick offset changes", () => {
    const engine = new LinkToMidiClockEngine({ ...defaultConfig, midiOutputName: "USB MIDI Device" });
    engine.updateLink({ bpm: 120, beat: 4, phase: 0, peers: 1, playing: true, receivedAtMs: 1000, warning: null }, 1000);
    engine.startNow(1000);
    expect(engine.tick(1000).map((command) => command.type)).toEqual(["start", "clock"]);

    expect(engine.tick(1010)).toEqual([]);
    engine.nudge(-10);

    expect(engine.tick(1014)).toEqual([]);
    expect(engine.tick(60000 / 120 / 24 + 1000).map((command) => command.type)).toEqual(["clock"]);
  });

  it("clamps kick offset to the MVP range", () => {
    const engine = new LinkToMidiClockEngine(defaultConfig);
    engine.nudge(999);
    expect(engine.getConfig().kickOffsetMs).toBe(250);
    engine.nudge(-999);
    expect(engine.getConfig().kickOffsetMs).toBe(-250);
  });

  it("selects a preferred hardware output when no MIDI output is configured", () => {
    const engine = new LinkToMidiClockEngine(defaultConfig);
    engine.setAvailableMidiOutputs(["Virtual Midi Virtual", "USB MIDI Device"]);

    expect(engine.getStatus().selectedMidiOutput).toBe("USB MIDI Device");
  });

  it("remembers the last selected MIDI output while it is disconnected", () => {
    const engine = new LinkToMidiClockEngine({ ...defaultConfig, midiOutputName: "EP-133 KO II" });

    engine.setAvailableMidiOutputs(["Virtual Midi Virtual", "USB MIDI Device"]);
    expect(engine.getConfig().midiOutputName).toBe("EP-133 KO II");
    expect(engine.getStatus().selectedMidiOutput).toBe("EP-133 KO II");

    engine.setAvailableMidiOutputs(["Virtual Midi Virtual", "EP-133 KO II"]);
    expect(engine.getStatus().selectedMidiOutput).toBe("EP-133 KO II");
  });

  it("recognizes the remembered MIDI output when the returned port name is equivalent", () => {
    const engine = new LinkToMidiClockEngine({ ...defaultConfig, midiOutputName: "EP-133 KO II" });

    engine.setAvailableMidiOutputs(["EP 133 MIDI Out"]);

    expect(engine.getConfig().midiOutputName).toBe("EP 133 MIDI Out");
    expect(engine.getStatus().selectedMidiOutput).toBe("EP 133 MIDI Out");
  });

  it("keeps a valid user-selected virtual output when other MIDI devices are available", () => {
    const engine = new LinkToMidiClockEngine({ ...defaultConfig, midiOutputName: "Virtual Midi Virtual" });
    engine.setAvailableMidiOutputs(["Virtual Midi Virtual", "USB MIDI Device"]);

    expect(engine.getStatus().selectedMidiOutput).toBe("Virtual Midi Virtual");
  });

  it("prefers the Ableton Move standalone port when it is available", () => {
    const engine = new LinkToMidiClockEngine(defaultConfig);

    engine.setAvailableMidiOutputs([
      "Virtual Midi Virtual",
      "Ableton Move Live Port",
      "Ableton Move User Port",
      "Ableton Move Standalone Port"
    ]);

    expect(engine.getStatus().selectedMidiOutput).toBe("Ableton Move Standalone Port");
    expect(engine.getStatus().warning).toBeNull();
  });

  it("blocks Move ports that cannot receive MIDI Clock transport", () => {
    const engine = new LinkToMidiClockEngine(defaultConfig);
    engine.setAvailableMidiOutputs(["Ableton Move Live Port", "Ableton Move User Port", "Ableton Move External Port"]);
    engine.applyConfig({ midiOutputName: "Ableton Move Live Port" });
    engine.updateLink({ bpm: 120, beat: 4, phase: 0, peers: 1, playing: true, receivedAtMs: 1000, warning: null }, 1000);

    expect(engine.startNow(1000).appState).toBe("ERROR");
    expect(engine.tick(1000)).toEqual([]);
    expect(engine.getStatus().warning).toBeNull();
  });
});
