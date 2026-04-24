import { app, BrowserWindow, desktopCapturer, ipcMain, session } from "electron";
import { join } from "node:path";
import { saveToken, getToken, clearToken } from "./token-store.js";

// electron-vite exposes ELECTRON_RENDERER_URL in dev; absent in prod.
const RENDERER_DEV_URL = process.env["ELECTRON_RENDERER_URL"];

// Dev/test escape hatch: run a second instance with an isolated session.
// REDVOICE_USER_DATA_DIR=/tmp/redvoice-b pnpm --filter @redvoice/client dev
if (process.env["REDVOICE_USER_DATA_DIR"]) {
  app.setPath("userData", process.env["REDVOICE_USER_DATA_DIR"]);
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#101014",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.mjs"),
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

  // getDisplayMedia requires an explicit handler in Electron — without it the
  // renderer's request returns "Not supported". MVP: auto-pick the first screen
  // source. Plan 4 replaces this with a real picker UI.
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
      if (sources.length === 0) {
        callback({});
        return;
      }
      // On Windows, "loopback" captures system audio with the screenshare.
      // On macOS/Linux this value is rejected — omit audio there and rely on
      // the OS portal (Linux PipeWire handles audio via the system picker).
      if (process.platform === "win32") {
        callback({ video: sources[0]!, audio: "loopback" });
      } else {
        callback({ video: sources[0]! });
      }
    } catch (err) {
      console.error("desktopCapturer.getSources failed:", err);
      callback({});
    }
  });

  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
