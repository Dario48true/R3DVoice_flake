import { contextBridge, ipcRenderer } from "electron";
import type { RedVoiceBridge } from "../shared/bridge-types.js";

const bridge: RedVoiceBridge = {
  saveToken: (token) => ipcRenderer.invoke("auth:save-token", token),
  getToken: () => ipcRenderer.invoke("auth:get-token"),
  clearToken: () => ipcRenderer.invoke("auth:clear-token"),
  platform: () => process.platform,
};

contextBridge.exposeInMainWorld("redvoice", bridge);
