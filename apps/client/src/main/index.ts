import { app, BrowserWindow, desktopCapturer, ipcMain, Menu, screen, session } from "electron";
import { join } from "node:path";
import { existsSync, writeFileSync, rmSync } from "node:fs";
import { saveToken, getToken, clearToken } from "./token-store.js";
import { openScreenPicker, registerScreenPickerHandlers } from "./screen-picker.js";
import { setPttKeybind, teardownKeybinds } from "./keybinds.js";
import { initAutoUpdate } from "./auto-update.js";
import { writeDesktopEntry, resolveIconPath } from "./desktop-integration.js";
import {
  openSplashWindow,
  sendSplashStatus,
  closeSplash,
} from "./splash-window.js";
import {
  registerDeepLinkHandlers,
  extractDeepLinkFromArgv,
  parseDeepLink,
  dispatchDeepLink,
} from "./deep-links.js";

// Force app name / WMClass to "RedVoice" so Plasma/GNOME taskbars match this
// window to ~/.local/share/applications/redvoice.desktop instead of falling
// back to the AppImage's bundled @redvoiceclient.desktop (which lives inside
// a temporary mount that vanishes on exit).
app.setName("RedVoice");
app.commandLine.appendSwitch("class", "RedVoice");
Menu.setApplicationMenu(null);

// Single-instance lock: a second `redvoice://…` launch funnels through
// `second-instance` instead of spawning another process.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

// When launched from a desktop-file or taskbar (no attached terminal),
// process.stdout/stderr are closed pipes. Any console.* write — ours or
// from a dep like electron-updater — throws EPIPE. Without these guards
// the main process crashes before the window opens.
function swallowEpipe(err: NodeJS.ErrnoException): void {
  if (err.code === "EPIPE") return;
  throw err;
}
process.stdout.on("error", swallowEpipe);
process.stderr.on("error", swallowEpipe);
process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") return;
  // Re-throw anything else so we don't silently swallow real bugs.
  throw err;
});

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

async function createWindow(splash: BrowserWindow | null): Promise<BrowserWindow> {
  const iconPath = resolveIconPath();
  const primary = screen.getPrimaryDisplay().workArea;
  const winW = 1200;
  const winH = 800;
  const win = new BrowserWindow({
    width: winW,
    height: winH,
    x: primary.x + Math.round((primary.width - winW) / 2),
    y: primary.y + Math.round((primary.height - winH) / 2),
    backgroundColor: "#101014",
    show: false, // splash holds the screen until ready-to-show fires
    ...(iconPath && { icon: iconPath }),
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once("ready-to-show", () => {
    sendSplashStatus(splash, { phase: "ready" });
    // Brief delay so the user sees "Ready" — feels intentional, not abrupt.
    setTimeout(() => {
      if (!win.isDestroyed()) win.show();
      closeSplash(splash);
    }, 300);
  });

  // Setting applicationMenu to null drops Electron's default accelerators
  // (Ctrl+R, Ctrl+Shift+I, F12) along with the menu bar — rebind them here.
  win.webContents.on("before-input-event", (_evt, input) => {
    if (input.type !== "keyDown") return;
    const key = input.key.toLowerCase();
    const ctrlLike = input.control || input.meta;
    if (ctrlLike && key === "r" && !input.shift) {
      win.webContents.reload();
    } else if (ctrlLike && key === "r" && input.shift) {
      win.webContents.reloadIgnoringCache();
    } else if ((ctrlLike && input.shift && key === "i") || key === "f12") {
      win.webContents.toggleDevTools();
    }
  });

  if (RENDERER_DEV_URL) {
    await win.loadURL(RENDERER_DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
  return win;
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

let mainWindow: BrowserWindow | null = null;

// Hot launch: OS delivers the URL through second-instance argv (Linux/Windows).
app.on("second-instance", (_event, argv) => {
  const link = extractDeepLinkFromArgv(argv);
  if (link) dispatchDeepLink(link, mainWindow);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// macOS delivers deep-link clicks via open-url, not argv.
app.on("open-url", (event, url) => {
  event.preventDefault();
  const link = parseDeepLink(url);
  if (link) dispatchDeepLink(link, mainWindow);
});

app.whenReady().then(async () => {
  registerIpcHandlers();
  registerScreenPickerHandlers();
  registerDeepLinkHandlers();
  writeDesktopEntry();

  // Dev-only: REDVOICE_SPLASH_DEMO=1 cycles every splash phase slowly and
  // skips the main window so you can inspect the splash in isolation.
  if (process.env["REDVOICE_SPLASH_DEMO"]) {
    const splash = openSplashWindow();
    splash.webContents.once("did-finish-load", () => {
      const steps: Array<[Parameters<typeof sendSplashStatus>[1], number]> = [
        [{ phase: "initializing" }, 2000],
        [{ phase: "checking" }, 2000],
        [{ phase: "available" }, 2000],
        [{ phase: "downloading", percent: 15 }, 600],
        [{ phase: "downloading", percent: 45 }, 600],
        [{ phase: "downloading", percent: 80 }, 600],
        [{ phase: "downloading", percent: 100 }, 600],
        [{ phase: "downloaded" }, 2000],
        [{ phase: "loading" }, 2000],
        [{ phase: "ready" }, 30000],
      ];
      let t = 0;
      for (const [status, delay] of steps) {
        setTimeout(() => sendSplashStatus(splash, status), t);
        t += delay;
      }
    });
    return;
  }

  // Open splash FIRST so the user sees feedback while the renderer + any
  // update check are warming up.
  const splash = openSplashWindow();
  splash.webContents.once("did-finish-load", () => {
    sendSplashStatus(splash, { phase: "initializing" });
  });

  initAutoUpdate(splash);

  // On Wayland, xdg-desktop-portal is the picker — the OS won't let any app
  // enumerate screens without the user clicking in the portal dialog first.
  // So our custom picker would stack on top of the OS picker and hang on
  // "Loading sources…". Skip our UI on Wayland, defer entirely to the portal.
  const isWayland =
    process.platform === "linux" &&
    (process.env["XDG_SESSION_TYPE"] === "wayland" ||
      Boolean(process.env["WAYLAND_DISPLAY"]));

  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    if (isWayland) {
      // Portal prompts the user; getSources returns just the chosen source.
      const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
      if (sources.length === 0) {
        callback({});
        return;
      }
      callback({ video: sources[0]! });
      return;
    }

    // Everywhere else (X11, macOS, Windows): show our in-app picker
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

  mainWindow = await createWindow(splash);

  // Cold launch via `redvoice://…` — URL is in process.argv; stash as pending
  // so the renderer picks it up after it finishes loading.
  const coldLink = extractDeepLinkFromArgv(process.argv);
  if (coldLink) dispatchDeepLink(coldLink, mainWindow);

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = await createWindow(null);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  teardownKeybinds();
});
