import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { LinkSnapshot } from "../shared/types.js";

export interface LinkReader {
  enable(enabled: boolean): void;
  play(): void;
  stop(): void;
  onUpdate(listener: (snapshot: LinkSnapshot) => void): void;
  dispose(): void;
  getWarning(): string | null;
}

type WorkerMessage =
  | { type: "ready" }
  | {
      type: "link-update";
      bpm: number;
      beat: number;
      phase: number;
      peers: number;
      playing: boolean;
      warning: string | null;
    }
  | { type: "warning"; warning: string };

const BASE_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 30000;

export class AbletonLinkReader implements LinkReader {
  private child: ChildProcess | null = null;
  private enabled = false;
  private warning: string | null = null;
  private retryAfterMs = 0;
  private crashCount = 0;
  private listener: ((snapshot: LinkSnapshot) => void) | null = null;

  enable(enabled: boolean): void {
    this.enabled = enabled;

    if (!enabled) {
      this.send({ type: "enable", enabled: false });
      this.retryAfterMs = 0;
      this.crashCount = 0;
      return;
    }

    this.ensureChild();
    this.send({ type: "enable", enabled: true });
  }

  play(): void {
    if (this.enabled) this.ensureChild();
    this.send({ type: "play" });
  }

  stop(): void {
    if (this.enabled) this.ensureChild();
    this.send({ type: "stop" });
  }

  onUpdate(listener: (snapshot: LinkSnapshot) => void): void {
    this.listener = listener;
  }

  dispose(): void {
    this.send({ type: "dispose" });
    this.child?.kill();
    this.child = null;
  }

  getWarning(): string | null {
    return this.warning;
  }

  private ensureChild(): boolean {
    if (this.child && !this.child.killed) return true;

    const now = Date.now();
    if (this.retryAfterMs > now) {
      const waitSeconds = Math.ceil((this.retryAfterMs - now) / 1000);
      this.warning = `Ableton Link worker failed; retrying in ${waitSeconds}s.`;
      return false;
    }

    const workerPath = fileURLToPath(new URL("./link-worker.js", import.meta.url));
    this.child = fork(workerPath, [], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      silent: true
    });
    this.warning = "Ableton Link worker is starting.";

    this.child.on("message", (message: WorkerMessage) => {
      if (message.type === "ready") {
        this.warning = null;
        this.retryAfterMs = 0;
        this.crashCount = 0;
      }

      if (message.type === "link-update") {
        this.warning = message.warning;
        this.listener?.({
          bpm: message.bpm,
          beat: message.beat,
          phase: message.phase,
          peers: message.peers,
          playing: message.playing,
          receivedAtMs: performance.now(),
          warning: message.warning
        });
      }

      if (message.type === "warning") {
        this.warning = message.warning;
      }
    });

    this.child.on("exit", (code, signal) => {
      if (this.enabled) {
        this.crashCount += 1;
        const retryDelay = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** (this.crashCount - 1));
        this.retryAfterMs = Date.now() + retryDelay;
        this.warning = `Ableton Link worker exited (${signal ?? code ?? "unknown"}); retrying in ${Math.ceil(
          retryDelay / 1000
        )}s.`;
      }
      this.child = null;
    });

    return true;
  }

  private send(message: Record<string, unknown>): void {
    if (!this.child || this.child.killed) return;
    this.child.send(message);
  }
}
