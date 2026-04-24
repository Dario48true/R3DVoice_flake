import { app, BrowserWindow, dialog } from "electron";
// electron-updater exports a CJS-shaped module; use default import interop.
import electronUpdaterPkg from "electron-updater";
const { autoUpdater } = electronUpdaterPkg;

export function initAutoUpdate(): void {
  // No-op in dev. electron-updater crashes if invoked on an unpackaged app.
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    console.log("[auto-update] update available:", info.version);
  });

  autoUpdater.on("update-downloaded", (info) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      console.log("[auto-update] update downloaded but no window to prompt");
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
    console.error("[auto-update] error:", err);
  });

  void autoUpdater.checkForUpdatesAndNotify();
  // Re-check every 2 hours
  setInterval(() => void autoUpdater.checkForUpdatesAndNotify(), 2 * 60 * 60 * 1000);
}
