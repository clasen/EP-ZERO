import { app, BrowserWindow, ipcMain, nativeImage, screen } from "electron";
import Store from "electron-store";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AbletonLinkReader } from "./adapters/link-reader.js";
import { MidiOutputAdapter } from "./adapters/midi-output.js";
import { LinkToMidiClockEngine } from "./engine/clock-engine.js";
import { defaultConfig } from "./shared/defaults.js";
import type { AppSnapshot, EpZeroConfig, LinkSnapshot, MidiOutCommand } from "./shared/types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const isDev = !app.isPackaged;

const store = new Store<{ config: EpZeroConfig }>({
  name: "ep-zero-config",
  defaults: { config: defaultConfig }
});

const engine = new LinkToMidiClockEngine(store.get("config"));
const midi = new MidiOutputAdapter();
const link = new AbletonLinkReader();
const windows = new Set<BrowserWindow>();

let schedulerTimer: NodeJS.Timeout | null = null;
let midiRefreshTimer: NodeJS.Timeout | null = null;

function appIconPath(): string {
  return isDev ? join(process.cwd(), "public/app-icon.png") : join(__dirname, "../renderer/app-icon.png");
}

async function fitWindowToContent(window: BrowserWindow, width: number, maxHeight: number): Promise<void> {
  const contentHeight = await window.webContents.executeJavaScript(
    "Math.ceil(document.documentElement.scrollHeight)",
    true
  );
  const nextHeight = Math.min(Math.max(Number(contentHeight) || 620, 600), maxHeight);
  window.setContentSize(width, nextHeight);
}

function snapshot(): AppSnapshot {
  const engineStatus = engine.getStatus();
  return {
    config: engine.getConfig(),
    status: {
      ...engineStatus,
      selectedMidiOutput: midi.getOpenPortName() || engineStatus.selectedMidiOutput,
      warning: engineStatus.warning ?? midi.getWarning() ?? link.getWarning()
    }
  };
}

function broadcast(): AppSnapshot {
  const current = snapshot();
  for (const window of windows) {
    window.webContents.send("epzero:status", current);
  }
  return current;
}

function sendMidi(commands: MidiOutCommand[]): void {
  for (const command of commands) {
    if (command.type === "start" || command.type === "continue") link.play();
    if (command.type === "stop") link.stop();
  }
  midi.sendMany(commands);
}

function handleLinkUpdate(next: LinkSnapshot): void {
  const nowMs = performance.now();
  engine.updateLink(next, nowMs);
  sendMidi(engine.tick(nowMs));
  broadcast();
}

function persistConfig(): void {
  store.set("config", engine.getConfig());
}

async function createWindow(): Promise<void> {
  const workArea = screen.getPrimaryDisplay().workArea;
  const width = 460;
  const height = Math.min(780, workArea.height);

  const window = new BrowserWindow({
    title: "EP-ZERO",
    width,
    height,
    x: workArea.x + workArea.width - width,
    y: workArea.y,
    minWidth: 380,
    minHeight: 600,
    backgroundColor: "#101417",
    icon: appIconPath(),
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  windows.add(window);
  window.on("closed", () => windows.delete(window));
  window.webContents.once("did-finish-load", () => {
    window.webContents.setZoomFactor(1);
    void fitWindowToContent(window, width, workArea.height);
    void window.webContents.executeJavaScript("Boolean(window.epZero)").then((connected) => {
      console.log(`Renderer bridge: ${connected ? "connected" : "missing"}`);
    });
  });

  if (isDev) {
    await window.loadURL("http://127.0.0.1:5173");
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function refreshMidiOutputs(): void {
  const outputs = midi.listOutputs();
  engine.setAvailableMidiOutputs(outputs);
  const selected = engine.getConfig().midiOutputName;
  if (selected) {
    midi.openByName(selected);
  }
  broadcast();
}

app.whenReady().then(async () => {
  if (process.platform === "darwin") {
    app.dock.setIcon(nativeImage.createFromPath(appIconPath()));
  }

  link.onUpdate(handleLinkUpdate);
  link.enable(engine.getConfig().linkEnabled);
  refreshMidiOutputs();
  await createWindow();

  schedulerTimer = setInterval(() => {
    sendMidi(engine.tick(performance.now()));
    broadcast();
  }, 2);

  midiRefreshTimer = setInterval(refreshMidiOutputs, 2000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (schedulerTimer) clearInterval(schedulerTimer);
  if (midiRefreshTimer) clearInterval(midiRefreshTimer);
  sendMidi(engine.stop());
  midi.close();
  link.dispose();
});

ipcMain.handle("epzero:get-snapshot", () => snapshot());
ipcMain.handle("epzero:list-midi-outputs", () => {
  refreshMidiOutputs();
  return engine.getStatus().availableMidiOutputs;
});
ipcMain.handle("epzero:set-config", (_event, config: Partial<EpZeroConfig>) => {
  engine.applyConfig(config);
  link.enable(engine.getConfig().linkEnabled);
  persistConfig();
  if (config.midiOutputName !== undefined) {
    midi.openByName(engine.getConfig().midiOutputName);
  }
  return broadcast();
});
ipcMain.handle("epzero:select-midi-output", (_event, name: string) => {
  engine.applyConfig({ midiOutputName: name });
  midi.openByName(name);
  persistConfig();
  return broadcast();
});
ipcMain.handle("epzero:arm", () => {
  engine.arm(performance.now());
  return broadcast();
});
ipcMain.handle("epzero:start-now", () => {
  engine.startNow(performance.now());
  link.play();
  return broadcast();
});
ipcMain.handle("epzero:stop", () => {
  sendMidi(engine.stop());
  link.stop();
  return broadcast();
});
ipcMain.handle("epzero:nudge", (_event, deltaMs: number) => {
  engine.nudge(deltaMs);
  persistConfig();
  return broadcast();
});
ipcMain.handle("epzero:resync", () => {
  engine.resync(performance.now());
  return broadcast();
});
