import { Notification, ipcMain } from "electron";
import type { NotifyPayload } from "../shared/bridge-types.js";

export function registerNotificationsHandler(): void {
  ipcMain.handle("notify", (_event, payload: NotifyPayload) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: payload.title,
      body: payload.body,
      silent: payload.silent ?? false,
    });
    n.show();
  });
}
