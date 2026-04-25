import { app, BrowserWindow } from "electron";
// electron-updater exports a CJS-shaped module; use default import interop.
import electronUpdaterPkg from "electron-updater";
import { sendSplashStatus } from "./splash-window.js";
import type { SplashStatus } from "../shared/bridge-types.js";
const { autoUpdater } = electronUpdaterPkg;

function safeLog(...args: unknown[]): void {
  // Swallow EPIPE. When launched from a desktop-file with no terminal,
  // process.stdout/stderr are closed — any write throws uncaught EPIPE
  // and crashes the main process. Wrap every log site.
  try {
    // eslint-disable-next-line no-console
    console.log(...args);
  } catch {
    /* no stdout */
  }
}

/**
 * Initialize electron-updater and (optionally) forward update lifecycle
 * events to the splash window so the user gets feedback during startup.
 *
 * In dev (unpackaged) we skip electron-updater entirely (it crashes on
 * unpackaged apps) but synthesize a snappy initializing → loading → ready
 * sequence so the splash still feels alive while the renderer warms up.
 */
export function initAutoUpdate(splash: BrowserWindow | null = null): void {
  const send = (status: SplashStatus): void => sendSplashStatus(splash, status);

  if (!app.isPackaged) {
    // Dev: synthesize a brief progression. Each step is short — the goal is
    // to communicate "we're starting" without blocking the main window.
    setTimeout(() => send({ phase: "loading" }), 250);
    return;
  }

  // Disable electron-updater's default logger — it calls console.* with
  // verbose output, which EPIPEs when launched headlessly (no terminal).
  autoUpdater.logger = null;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    send({ phase: "checking" });
  });

  autoUpdater.on("update-not-available", () => {
    send({ phase: "loading" });
  });

  autoUpdater.on("update-available", (info) => {
    safeLog("[auto-update] update available:", info.version);
    send({ phase: "available", message: `Update ${info.version} available` });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = typeof progress.percent === "number" ? progress.percent : 0;
    send({ phase: "downloading", percent });
  });

  autoUpdater.on("update-downloaded", (info) => {
    // No dialog — autoInstallOnAppQuit handles it silently on next quit.
    // Next launch's splash renders the new version directly.
    safeLog("[auto-update] update downloaded:", info.version);
    send({ phase: "downloaded", message: `Update ${info.version} queued for next launch` });
  });

  autoUpdater.on("error", (err) => {
    safeLog("[auto-update] error:", err);
    send({ phase: "error", message: err instanceof Error ? err.message : String(err) });
  });

  void autoUpdater.checkForUpdatesAndNotify().catch(() => {
    /* swallow — offline, rate-limited, etc. */
  });
  // Re-check every 2 hours
  setInterval(() => {
    void autoUpdater.checkForUpdatesAndNotify().catch(() => {
      /* swallow */
    });
  }, 2 * 60 * 60 * 1000);
}
