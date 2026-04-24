import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { saveToken, getToken, clearToken } from "./token-store.js";

// electron-vite exposes ELECTRON_RENDERER_URL in dev; absent in prod.
const RENDERER_DEV_URL = process.env["ELECTRON_RENDERER_URL"];

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#101014",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (RENDERER_DEV_URL) {
    await win.loadURL(RENDERER_DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle("auth:save-token", async (_event, token: unknown) => {
    if (typeof token !== "string") throw new Error("invalid token");
    await saveToken(token);
  });
  ipcMain.handle("auth:get-token", async () => getToken());
  ipcMain.handle("auth:clear-token", async () => clearToken());
  ipcMain.handle("app:platform", () => process.platform);
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
