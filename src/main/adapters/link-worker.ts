import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type MainMessage =
  | { type: "enable"; enabled: boolean }
  | { type: "play" }
  | { type: "stop" }
  | { type: "dispose" };

let link: any | null = null;
let warning: string | null = null;
let enabled = false;

const DEFAULT_BPM = 120;
const DEFAULT_QUANTUM = 4;
const UPDATE_INTERVAL_MS = 20;

try {
  const Link = require("abletonlink");
  link = new Link(DEFAULT_BPM, DEFAULT_QUANTUM, false);
  process.send?.({ type: "ready" });
} catch (error) {
  warning = error instanceof Error ? error.message : "Ableton Link native binding failed to load.";
  process.send?.({ type: "warning", warning });
}

process.on("message", (message: MainMessage) => {
  if (message.type === "enable") {
    enabled = message.enabled;
    if (!link) return sendFallbackUpdate();

    if (enabled) {
      callIfExists(link, ["enable"]);
      callIfExists(link, ["enablePlayStateSync"]);
      callIfExists(link, ["startUpdate"], UPDATE_INTERVAL_MS, sendUpdate);
    } else {
      callIfExists(link, ["stopUpdate"]);
      callIfExists(link, ["disable"]);
    }
  }

  if (message.type === "play") {
    if (!link) return sendFallbackUpdate();
    callIfExists(link, ["enable"]);
    callIfExists(link, ["enablePlayStateSync"]);
    callIfExists(link, ["play"]);
    callIfExists(link, ["setIsPlaying"], true);
  }

  if (message.type === "stop") {
    if (!link) return sendFallbackUpdate();
    callIfExists(link, ["enable"]);
    callIfExists(link, ["enablePlayStateSync"]);
    callIfExists(link, ["stop"]);
    callIfExists(link, ["setIsPlaying"], false);
  }

  if (message.type === "dispose") {
    cleanup();
    process.exit(0);
  }
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

function sendUpdate(beat: number, phase: number, bpm: number, playing: boolean, peers: number): void {
  const currentPlaying =
    playing ||
    Boolean(callIfExists(link, ["getIsPlaying"])) ||
    Boolean(link?.isPlaying) ||
    Boolean(link?.isPlayingOnUpdate);

  process.send?.({
    type: "link-update",
    bpm,
    beat,
    phase,
    peers,
    playing: currentPlaying,
    warning
  });
}

function sendFallbackUpdate(): void {
  process.send?.({
    type: "link-update",
    bpm: 0,
    beat: 0,
    phase: 0,
    peers: 0,
    playing: false,
    warning
  });
}

function cleanup(): void {
  if (!link) return;
  callIfExists(link, ["stopUpdate"]);
  callIfExists(link, ["disable"]);
}

function callIfExists(target: any, names: string[], ...args: unknown[]): unknown {
  for (const name of names) {
    if (typeof target?.[name] === "function") {
      return target[name](...args);
    }
  }
  return undefined;
}
