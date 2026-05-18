import type { EpZeroConfig, EpZeroStatus } from "./types.js";

export const defaultConfig: EpZeroConfig = {
  midiOutputName: "",
  linkEnabled: true,
  startStopSyncEnabled: true,
  midiClockOutEnabled: true,
  transportOutEnabled: true,
  launchMode: "next_4_bar_phrase",
  quantum: 4,
  kickOffsetMs: 0,
  nudge: {
    fineMs: 1,
    coarseMs: 10
  }
};

export const defaultStatus: EpZeroStatus = {
  appState: "NO_LINK_SESSION",
  clockQuality: "Lost",
  selectedMidiOutput: "",
  availableMidiOutputs: [],
  lastMidiMessage: "none",
  linkBpm: 0,
  linkBeat: 0,
  linkPhase: 0,
  linkPeers: 0,
  linkEnabled: true,
  linkPlaying: false,
  startStopSyncEnabled: true,
  midiClockOutEnabled: true,
  transportOutEnabled: true,
  transportState: "stopped",
  launchMode: "next_4_bar_phrase",
  quantum: 4,
  appliedOffsetMs: 0,
  nextLaunchAtMs: null,
  warning: null
};
