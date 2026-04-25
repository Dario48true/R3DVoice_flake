// Linux: per-process audio capture for screenshare via @vencord/venmic.
//
// Same approach Vesktop uses (and Discord on Linux). venmic is a native
// PipeWire patchbay that creates a virtual audio device named
// "vencord-screen-share". When you `link()` it with an exclusion list, all
// non-excluded application audio streams are routed to that virtual device.
// The renderer captures the device via getUserMedia like any other mic.
//
// Phase 1 (this version): exclude RedVoice's own audio service from the
// virtual device, so screenshare audio carries every OTHER app's sound but
// not the call audio we're playing back. Same effect as the previous
// combine-sink hack but without modifying the user's default sink — much
// less invasive and recoverable on crash.
//
// Phase 2 (next): expose the per-app picker so the user can pick exactly
// which app to share audio from (Discord/Vesktop UX).

import { app, ipcMain } from "electron";
import type { PatchBay as PatchBayType, LinkData } from "@vencord/venmic";

let PatchBay: typeof PatchBayType | null = null;
let patchBay: PatchBayType | null = null;
let linked = false;
let initialized = false;

function importVenmic(): typeof PatchBayType | null {
  if (initialized) return PatchBay;
  initialized = true;
  if (process.platform !== "linux") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const venmic = require("@vencord/venmic") as typeof import("@vencord/venmic");
    if (!venmic.PatchBay.hasPipeWire()) {
      safeLog("[linux-audio] PipeWire not available — venmic skipped");
      return null;
    }
    PatchBay = venmic.PatchBay;
    return PatchBay;
  } catch (err) {
    safeLog("[linux-audio] failed to load venmic:", err);
    return null;
  }
}

function obtainPatchBay(): PatchBayType | null {
  const PB = importVenmic();
  if (!PB) return null;
  if (!patchBay) {
    try {
      patchBay = new PB();
    } catch (err) {
      safeLog("[linux-audio] failed to instantiate PatchBay:", err);
      return null;
    }
  }
  return patchBay;
}

function getRendererAudioServicePid(): string | null {
  // Electron runs WebRTC audio playback in a separate "Audio Service"
  // utility process. Excluding its PID from venmic keeps RedVoice's own
  // playback (incoming call voices) out of the virtual capture device.
  const procs = app.getAppMetrics();
  const audio = procs.find((p) => p.name === "Audio Service");
  return audio?.pid?.toString() ?? null;
}

function safeLog(...args: unknown[]): void {
  try {
    // eslint-disable-next-line no-console
    console.log(...args);
  } catch {
    /* */
  }
}

export interface EnableResult {
  /** Label of the virtual capture device — match it via enumerateDevices. */
  monitorDeviceDescription: string;
}

/** Idempotent. Returns null if venmic isn't available (no PipeWire / load failed). */
export function enableLinuxAudioRouting(): EnableResult | null {
  const pb = obtainPatchBay();
  if (!pb) return null;
  if (linked) return { monitorDeviceDescription: "vencord-screen-share" };

  const audioPid = getRendererAudioServicePid();
  if (!audioPid) {
    safeLog("[linux-audio] couldn't locate Audio Service PID; aborting to avoid self-capture");
    return null;
  }

  const data: LinkData = {
    include: [], // empty include = "everything except exclude"
    exclude: [
      { "application.process.id": audioPid },
      // Don't capture from input/mic streams — only output streams from apps.
      { "media.class": "Stream/Input/Audio" },
    ],
    // Only capture nodes that are actually playing to speakers (skip
    // disconnected / phantom streams).
    only_speakers: true,
    // Skip hardware devices themselves (their monitors get captured via the
    // app streams that play to them).
    ignore_devices: true,
  };

  try {
    const ok = pb.link(data);
    if (!ok) {
      safeLog("[linux-audio] PatchBay.link() returned false");
      return null;
    }
    linked = true;
    safeLog("[linux-audio] venmic linked — capturing all output streams except PID", audioPid);
    return { monitorDeviceDescription: "vencord-screen-share" };
  } catch (err) {
    safeLog("[linux-audio] PatchBay.link() threw:", err);
    return null;
  }
}

/** Tear down the venmic link. Safe to call when not enabled. */
export function disableLinuxAudioRouting(): void {
  if (!patchBay || !linked) return;
  try { patchBay.unlink(); } catch (err) { safeLog("[linux-audio] unlink threw:", err); }
  linked = false;
  safeLog("[linux-audio] venmic unlinked");
}

export function registerLinuxAudioRoutingHandlers(): void {
  ipcMain.handle("linux-audio-routing:enable", () => enableLinuxAudioRouting());
  ipcMain.handle("linux-audio-routing:disable", () => disableLinuxAudioRouting());
}

// Best-effort cleanup so we don't leave the virtual device hanging when the
// app exits. venmic auto-releases its PipeWire links when the process dies,
// but unlinking explicitly is faster.
app.on("will-quit", () => {
  disableLinuxAudioRouting();
});
