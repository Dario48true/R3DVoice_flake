import { app, BrowserWindow, dialog } from "electron";
// electron-updater exports a CJS-shaped module; use default import interop.
import electronUpdaterPkg from "electron-updater";
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

export function initAutoUpdate(): void {
  // No-op in dev. electron-updater crashes if invoked on an unpackaged app.
  if (!app.isPackaged) return;

  // Disable electron-updater's default logger — it calls console.* with
  // verbose output, which EPIPEs when launched headlessly (no terminal).
  autoUpdater.logger = null;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    safeLog("[auto-update] update available:", info.version);
  });

  autoUpdater.on("update-downloaded", (info) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      safeLog("[auto-update] update downloaded but no window to prompt");
      return;
    }
    void dialog
      .showMessageBox(win, {
        type: "info",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        title: "Update ready",
        message: `RedVoice ${info.version} is ready. Restart to apply.`,
      })
      .then((res) => {
        if (res.response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on("error", (err) => {
    safeLog("[auto-update] error:", err);
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
