const { contextBridge, ipcRenderer } = require("electron");

const api = {
  getSnapshot: () => ipcRenderer.invoke("epzero:get-snapshot"),
  listMidiOutputs: () => ipcRenderer.invoke("epzero:list-midi-outputs"),
  setConfig: (config) => ipcRenderer.invoke("epzero:set-config", config),
  selectMidiOutput: (name) => ipcRenderer.invoke("epzero:select-midi-output", name),
  arm: () => ipcRenderer.invoke("epzero:arm"),
  startNow: () => ipcRenderer.invoke("epzero:start-now"),
  stop: () => ipcRenderer.invoke("epzero:stop"),
  nudge: (deltaMs) => ipcRenderer.invoke("epzero:nudge", deltaMs),
  resync: () => ipcRenderer.invoke("epzero:resync"),
  onStatus: (listener) => {
    const handler = (_event, snapshot) => listener(snapshot);
    ipcRenderer.on("epzero:status", handler);
    return () => ipcRenderer.off("epzero:status", handler);
  }
};

contextBridge.exposeInMainWorld("epZero", api);
