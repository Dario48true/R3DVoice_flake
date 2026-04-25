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
import { basename } from "node:path";
import type { PatchBay as PatchBayType, LinkData, Node } from "@vencord/venmic";

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
  const audio = procs.find(
    (p) => p.name === "Audio Service" || p.name === "Utility: Audio Service",
  );
  return audio?.pid?.toString() ?? null;
}

function getRedVoiceExcludeRules(): Node[] {
  // Match any audio stream whose origin is a RedVoice process — by PID,
  // by binary name, by app name, by node name. PipeWire reports different
  // facets for different streams (renderer vs Audio Service vs main), and a
  // miss anywhere means the user's own playback bleeds back into the share.
  // Each rule is OR'd by venmic, so adding more is strictly safer.
  const rules: Node[] = [];

  const audioPid = getRendererAudioServicePid();
  if (audioPid) rules.push({ "application.process.id": audioPid });
  rules.push({ "application.process.id": String(process.pid) });

  // Process binary name (executableName: "redvoice" per electron-builder.yml).
  // Match BOTH the dynamic execPath and the literal name in case the AppImage
  // mounts under a different basename.
  const execName = basename(process.execPath).toLowerCase();
  if (execName) rules.push({ "application.process.binary": execName });
  rules.push({ "application.process.binary": "redvoice" });

  // App name (app.setName("RedVoice")) and casing variants PipeWire might use.
  rules.push({ "application.name": "RedVoice" });
  rules.push({ "application.name": app.getName() });

  // Skip mic-input streams entirely so we never accidentally re-capture them.
  rules.push({ "media.class": "Stream/Input/Audio" });

  return rules;
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

export interface AudioSourceSummary {
  /** node.name — stable identifier across the same app session. */
  nodeName: string;
  /** application.name — human-friendly app label. */
  appName: string;
  /** application.process.id — for tie-breaking when same-named apps run twice. */
  processId: string;
  /** Optional icon name (XDG), if PipeWire reported one. */
  iconName?: string;
}

/** List audio-producing apps PipeWire knows about, with our own PID filtered out. */
export function listLinuxAudioSources(): AudioSourceSummary[] {
  const pb = obtainPatchBay();
  if (!pb) return [];
  const audioPid = getRendererAudioServicePid();
  try {
    const nodes = pb.list([
      "node.name",
      "application.name",
      "application.process.id",
      "application.icon-name",
      "media.class",
    ] as const as string[]);
    const seen = new Set<string>();
    const out: AudioSourceSummary[] = [];
    for (const n of nodes) {
      // Only output streams (apps producing sound), not mic captures.
      if (n["media.class"] !== "Stream/Output/Audio") continue;
      // Drop ourselves.
      if (audioPid && n["application.process.id"] === audioPid) continue;
      const appName = (n["application.name"] ?? n["node.name"] ?? "Unknown").trim();
      const nodeName = n["node.name"] ?? "";
      const processId = n["application.process.id"] ?? "";
      // Dedupe by app + pid so e.g. Firefox doesn't appear N times for N tabs.
      const key = `${appName}::${processId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        nodeName,
        appName,
        processId,
        ...(n["application.icon-name"] ? { iconName: n["application.icon-name"] } : {}),
      });
    }
    return out;
  } catch (err) {
    safeLog("[linux-audio] list() threw:", err);
    return [];
  }
}

export interface EnableOptions {
  /**
   * If given, capture only this specific app (by application.process.id).
   * If omitted, capture every output stream except RedVoice itself —
   * the existing v0.4.14 behavior.
   */
  includeProcessId?: string;
}

/** Idempotent. Returns null if venmic isn't available (no PipeWire / load failed). */
export function enableLinuxAudioRouting(options: EnableOptions = {}): EnableResult | null {
  const pb = obtainPatchBay();
  if (!pb) return null;
  // Re-link if we're already linked but the caller wants a different scope —
  // PatchBay.link() replaces the existing graph wiring atomically.

  const excludeRules = getRedVoiceExcludeRules();
  if (excludeRules.length === 0) {
    safeLog("[linux-audio] no exclude rules derivable; aborting to avoid self-capture");
    return null;
  }

  const data: LinkData = options.includeProcessId
    ? {
        include: [{ "application.process.id": options.includeProcessId }],
        exclude: excludeRules,
        ignore_devices: true,
      }
    : {
        include: [],
        exclude: excludeRules,
        only_speakers: true,
        ignore_devices: true,
      };

  try {
    const ok = pb.link(data);
    if (!ok) {
      safeLog("[linux-audio] PatchBay.link() returned false");
      return null;
    }
    linked = true;
    safeLog(
      "[linux-audio] venmic linked —",
      options.includeProcessId
        ? `including PID ${options.includeProcessId}`
        : `excluding ${excludeRules.length} RedVoice rules`,
    );
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
  ipcMain.handle("linux-audio-routing:enable", (_evt, options?: EnableOptions) =>
    enableLinuxAudioRouting(options),
  );
  ipcMain.handle("linux-audio-routing:disable", () => disableLinuxAudioRouting());
  ipcMain.handle("linux-audio-routing:list-sources", () => listLinuxAudioSources());
}

// Best-effort cleanup so we don't leave the virtual device hanging when the
// app exits. venmic auto-releases its PipeWire links when the process dies,
// but unlinking explicitly is faster.
app.on("will-quit", () => {
  disableLinuxAudioRouting();
});
