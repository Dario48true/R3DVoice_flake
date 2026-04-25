import { contextBridge, ipcRenderer } from "electron";
import type { RedVoiceBridge, SplashStatus } from "../shared/bridge-types.js";

const bridge: RedVoiceBridge = {
  saveToken: (token) => ipcRenderer.invoke("auth:save-token", token),
  getToken: () => ipcRenderer.invoke("auth:get-token"),
  clearToken: () => ipcRenderer.invoke("auth:clear-token"),
  platform: () => process.platform,
  listScreenSources: () => ipcRenderer.invoke("screen-picker:list"),
  selectScreenSource: (sourceId) => ipcRenderer.invoke("screen-picker:select", sourceId),
  cancelScreenPicker: () => ipcRenderer.invoke("screen-picker:cancel"),
  setPttKeybind: (accelerator) => ipcRenderer.invoke("keybind:set-ptt", accelerator),
  setCompatibilityEnv: (enabled) => ipcRenderer.invoke("app:set-compatibility-env", enabled),
  relaunch: () => ipcRenderer.invoke("app:relaunch"),
  onPttEvent: (cb) => {
    const handler = (_evt: Electron.IpcRendererEvent, pressed: boolean): void => cb(pressed);
    ipcRenderer.on("keybind:ptt", handler);
    return () => ipcRenderer.off("keybind:ptt", handler);
  },
  onSplashStatus: (cb) => {
    const handler = (_evt: Electron.IpcRendererEvent, status: SplashStatus): void => cb(status);
    ipcRenderer.on("splash:status", handler);
    return () => ipcRenderer.off("splash:status", handler);
  },
};

contextBridge.exposeInMainWorld("redvoice", bridge);
