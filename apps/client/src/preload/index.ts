import { contextBridge, ipcRenderer } from "electron";
import type { RedVoiceBridge } from "../shared/bridge-types.js";

const bridge: RedVoiceBridge = {
  saveToken: (token) => ipcRenderer.invoke("auth:save-token", token),
  getToken: () => ipcRenderer.invoke("auth:get-token"),
  clearToken: () => ipcRenderer.invoke("auth:clear-token"),
  platform: () => process.platform,
  listScreenSources: () => ipcRenderer.invoke("screen-picker:list"),
  selectScreenSource: (sourceId) => ipcRenderer.invoke("screen-picker:select", sourceId),
  cancelScreenPicker: () => ipcRenderer.invoke("screen-picker:cancel"),
  setPttKeybind: (accelerator) => ipcRenderer.invoke("keybind:set-ptt", accelerator),
  onPttEvent: (cb) => {
    const handler = (_evt: Electron.IpcRendererEvent, pressed: boolean): void => cb(pressed);
    ipcRenderer.on("keybind:ptt", handler);
    return () => ipcRenderer.off("keybind:ptt", handler);
  },
};

contextBridge.exposeInMainWorld("redvoice", bridge);
