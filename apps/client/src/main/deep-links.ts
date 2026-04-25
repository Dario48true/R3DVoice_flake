import { app, BrowserWindow, ipcMain } from "electron";
import type { DeepLinkEvent } from "../shared/bridge-types.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let pending: DeepLinkEvent | null = null;

/** Parse a redvoice:// URL into a typed event, or null if it doesn't match a known shape. */
export function parseDeepLink(raw: string): DeepLinkEvent | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "redvoice:") return null;

  // redvoice://join/<uuid> — `host` is "join", pathname is "/<uuid>"
  if (url.host === "join") {
    const id = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
    if (UUID_RE.test(id)) return { type: "join-room", roomId: id };
  }
  return null;
}

/** Scan argv (process argv or second-instance argv) for a redvoice:// URL. */
export function extractDeepLinkFromArgv(argv: string[]): DeepLinkEvent | null {
  for (const arg of argv) {
    if (arg.startsWith("redvoice://")) {
      const link = parseDeepLink(arg);
      if (link) return link;
    }
  }
  return null;
}

/** Send a deep-link event to the main window if present, otherwise queue it. */
export function dispatchDeepLink(link: DeepLinkEvent, mainWin: BrowserWindow | null): void {
  if (mainWin && !mainWin.isDestroyed() && !mainWin.webContents.isDestroyed()) {
    mainWin.webContents.send("deep-link", link);
  } else {
    pending = link;
  }
}

/** Register the redvoice:// scheme as a protocol handler + IPC for the renderer to poll pending. */
export function registerDeepLinkHandlers(): void {
  // Electron's protocol-client API handles cross-platform plumbing.
  // In dev (unpackaged), we must pass execPath + the script path so the OS knows how to relaunch.
  if (process.defaultApp) {
    if (process.argv.length >= 2 && typeof process.argv[1] === "string") {
      app.setAsDefaultProtocolClient("redvoice", process.execPath, [process.argv[1]]);
    }
  } else {
    app.setAsDefaultProtocolClient("redvoice");
  }

  ipcMain.handle("deep-link:consume-pending", () => {
    const link = pending;
    pending = null;
    return link;
  });
}
