import { contextBridge, ipcRenderer } from "electron";
import type { RedVoiceBridge, SplashStatus, DeepLinkEvent } from "../shared/bridge-types.js";

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
  onDeepLink: (cb) => {
    const handler = (_evt: Electron.IpcRendererEvent, link: DeepLinkEvent): void => cb(link);
    ipcRenderer.on("deep-link", handler);
    // Ask main for any deep link queued before we subscribed (cold-start case).
    void ipcRenderer.invoke("deep-link:consume-pending").then((link: DeepLinkEvent | null) => {
      if (link) cb(link);
    });
    return () => ipcRenderer.off("deep-link", handler);
  },
};

contextBridge.exposeInMainWorld("redvoice", bridge);
