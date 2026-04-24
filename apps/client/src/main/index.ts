import { app, BrowserWindow, desktopCapturer, ipcMain, session } from "electron";
import { join } from "node:path";
import { existsSync, writeFileSync, rmSync } from "node:fs";
import { saveToken, getToken, clearToken } from "./token-store.js";
import { openScreenPicker, registerScreenPickerHandlers } from "./screen-picker.js";
import { setPttKeybind, teardownKeybinds } from "./keybinds.js";

// electron-vite exposes ELECTRON_RENDERER_URL in dev; absent in prod.
const RENDERER_DEV_URL = process.env["ELECTRON_RENDERER_URL"];

// Dev/test escape hatch: run a second instance with an isolated session.
// REDVOICE_USER_DATA_DIR=/tmp/redvoice-b pnpm --filter @redvoice/client dev
if (process.env["REDVOICE_USER_DATA_DIR"]) {
  app.setPath("userData", process.env["REDVOICE_USER_DATA_DIR"]);
}

// Self-relaunch compatibility mode: if a prior session set compat mode, honor it.
try {
  const userData = process.env["REDVOICE_USER_DATA_DIR"] ?? app.getPath("userData");
  const compatFlagPath = join(userData, "compat.flag");
  if (
    process.platform === "linux" &&
    existsSync(compatFlagPath) &&
    !process.argv.includes("--ozone-platform=x11")
  ) {
    app.commandLine.appendSwitch("ozone-platform", "x11");
  }
} catch {
  // Too early; skip. Flag will take effect on the next launch.
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
  ipcMain.handle("keybind:set-ptt", (_evt, accelerator: unknown) => {
    const acc = typeof accelerator === "string" && accelerator.length > 0 ? accelerator : null;
    setPttKeybind(acc, (pressed) => {
      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.webContents.isDestroyed()) w.webContents.send("keybind:ptt", pressed);
      });
    });
  });
  ipcMain.handle("app:set-compatibility-env", (_evt, enabled: unknown) => {
    const userData = process.env["REDVOICE_USER_DATA_DIR"] ?? app.getPath("userData");
    const flagPath = join(userData, "compat.flag");
    if (enabled === true) {
      writeFileSync(flagPath, "1");
    } else {
      rmSync(flagPath, { force: true });
    }
  });
  ipcMain.handle("app:relaunch", () => {
    app.relaunch();
    app.exit(0);
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  registerScreenPickerHandlers();

  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sourceId = await openScreenPicker();
    if (!sourceId) {
      callback({});
      return;
    }
    const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
    const picked = sources.find((s) => s.id === sourceId);
    if (!picked) {
      callback({});
      return;
    }
    if (process.platform === "win32") {
      callback({ video: picked, audio: "loopback" });
    } else {
      callback({ video: picked });
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

app.on("will-quit", () => {
  teardownKeybinds();
});
