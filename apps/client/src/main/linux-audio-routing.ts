// Linux-only: programmatic PulseAudio/PipeWire routing so screenshare audio
// excludes RedVoice's own playback (incoming call voices) without requiring
// the user to wear headphones.
//
// Architecture:
//   1. Save the user's current default sink (e.g. their speakers / DAC).
//   2. Create a null sink "redvoice_share" — its monitor is what screenshare
//      audio capture reads.
//   3. Create a combine-sink "redvoice_default" with slaves = original
//      default + redvoice_share. Audio sent here plays through speakers AND
//      duplicates into the share-capture monitor.
//   4. Set redvoice_default as the new system default. New audio streams
//      from other apps automatically end up in both. Existing streams get
//      moved over.
//   5. RedVoice's own audio streams are kept on the original default sink
//      via setSinkId in the renderer — so RedVoice playback bypasses the
//      combine-sink and never reaches the share-capture monitor.
//
// On disable: move sink-inputs back, restore the default, unload modules.
// On crash: best-effort cleanup via app.on("will-quit"). If RedVoice dies
// hard, the user can recover with `pactl set-default-sink <name>` (the
// modules unload automatically when their PulseAudio client connection drops).

import { app, ipcMain } from "electron";
import { spawn } from "node:child_process";

interface RoutingState {
  originalDefaultSink: string;
  shareSinkModuleId: number;
  combineSinkModuleId: number;
  /** Sink-input IDs (PA numeric IDs) we moved to the combine-sink. */
  movedSinkInputs: string[];
  maintainTimer: NodeJS.Timeout | null;
}

let state: RoutingState | null = null;

function pactl(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("pactl", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`pactl ${args.join(" ")} exited ${code}: ${stderr.trim() || stdout.trim()}`));
    });
  });
}

async function getDefaultSink(): Promise<string> {
  return await pactl(["get-default-sink"]);
}

async function loadModule(name: string, args: string): Promise<number> {
  // load-module prints the module ID on stdout.
  const out = await pactl(["load-module", name, ...args.split(/\s+/)]);
  const id = Number.parseInt(out, 10);
  if (!Number.isFinite(id)) throw new Error(`load-module ${name} returned non-numeric: ${out}`);
  return id;
}

interface SinkInput {
  id: string;
  appName: string | null;
  processId: string | null;
  sinkId: string | null;
}

async function listSinkInputs(): Promise<SinkInput[]> {
  let raw: string;
  try {
    raw = await pactl(["list", "sink-inputs"]);
  } catch {
    return [];
  }
  const blocks = raw.split(/\n(?=Sink Input #)/);
  return blocks.map((block) => {
    const idMatch = /Sink Input #(\d+)/.exec(block);
    const sinkMatch = /^\s*Sink:\s*(\d+)/m.exec(block);
    const appNameMatch = /application\.name\s*=\s*"([^"]+)"/.exec(block);
    const procIdMatch = /application\.process\.id\s*=\s*"([^"]+)"/.exec(block);
    return {
      id: idMatch?.[1] ?? "",
      sinkId: sinkMatch?.[1] ?? null,
      appName: appNameMatch?.[1] ?? null,
      processId: procIdMatch?.[1] ?? null,
    };
  }).filter((s) => s.id !== "");
}

function isOurSinkInput(s: SinkInput, ownPids: Set<string>): boolean {
  if (s.processId && ownPids.has(s.processId)) return true;
  // Fallback heuristic — match the app name we set via app.setName("RedVoice").
  if (s.appName && /^redvoice$/i.test(s.appName)) return true;
  return false;
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
  /** PulseAudio source name to capture for screenshare audio (e.g. "redvoice_share.monitor"). */
  monitorSourceName: string;
  /** Human description used for the monitor — helps the renderer locate it via enumerateDevices. */
  monitorDeviceDescription: string;
}

/**
 * Set up the routing. Idempotent — if already enabled, returns the existing
 * state's monitor info.
 */
export async function enableLinuxAudioRouting(): Promise<EnableResult | null> {
  if (process.platform !== "linux") return null;
  if (state) {
    return {
      monitorSourceName: "redvoice_share.monitor",
      monitorDeviceDescription: "Monitor of RedVoice Share Capture",
    };
  }

  let originalDefaultSink: string;
  try {
    originalDefaultSink = await getDefaultSink();
  } catch (err) {
    safeLog("[linux-audio] pactl unavailable:", err);
    return null;
  }
  if (!originalDefaultSink) return null;

  let shareSinkModuleId: number | null = null;
  let combineSinkModuleId: number | null = null;
  try {
    shareSinkModuleId = await loadModule(
      "module-null-sink",
      `sink_name=redvoice_share sink_properties=device.description="RedVoice_Share_Capture"`,
    );
    combineSinkModuleId = await loadModule(
      "module-combine-sink",
      `sink_name=redvoice_default slaves=${originalDefaultSink},redvoice_share sink_properties=device.description="RedVoice_Default"`,
    );
    await pactl(["set-default-sink", "redvoice_default"]);

    // Move existing non-RedVoice streams onto the combined default.
    const ownPids = new Set<string>([String(process.pid)]);
    // Renderer / GPU children share parent PID for ownership but get their
    // own process IDs in PulseAudio. Best-effort include them — process.pid
    // alone covers main; the appName fallback catches the rest.
    const sinkInputs = await listSinkInputs();
    const moved: string[] = [];
    for (const s of sinkInputs) {
      if (isOurSinkInput(s, ownPids)) continue;
      try {
        await pactl(["move-sink-input", s.id, "redvoice_default"]);
        moved.push(s.id);
      } catch (err) {
        safeLog("[linux-audio] move-sink-input failed:", s.id, err);
      }
    }

    // Periodic maintenance: keep RedVoice's own audio streams pinned to the
    // original default sink (so they stay audible but don't bleed into the
    // share-capture monitor), and route every other stream onto the combine
    // sink so it plays AND gets captured. Catches new streams (e.g. when a
    // new participant joins and a fresh <audio> element starts playing) that
    // appeared after the initial enable pass.
    const maintainTimer = setInterval(() => {
      void maintainRouting().catch(() => { /* swallow */ });
    }, 2000);

    state = {
      originalDefaultSink,
      shareSinkModuleId,
      combineSinkModuleId,
      movedSinkInputs: moved,
      maintainTimer,
    };
    safeLog(
      "[linux-audio] routing enabled — share capture on redvoice_share.monitor, default was",
      originalDefaultSink,
    );
    return {
      monitorSourceName: "redvoice_share.monitor",
      monitorDeviceDescription: "Monitor of RedVoice Share Capture",
    };
  } catch (err) {
    safeLog("[linux-audio] enable failed, rolling back:", err);
    // Roll back what we did.
    if (combineSinkModuleId !== null) {
      try { await pactl(["unload-module", String(combineSinkModuleId)]); } catch { /* */ }
    }
    if (shareSinkModuleId !== null) {
      try { await pactl(["unload-module", String(shareSinkModuleId)]); } catch { /* */ }
    }
    try { await pactl(["set-default-sink", originalDefaultSink]); } catch { /* */ }
    return null;
  }
}

async function maintainRouting(): Promise<void> {
  if (!state) return;
  const ownPids = new Set<string>([String(process.pid)]);
  let inputs: SinkInput[];
  try {
    inputs = await listSinkInputs();
  } catch { return; }
  for (const i of inputs) {
    const ours = isOurSinkInput(i, ownPids);
    if (ours) {
      // Pin our audio to the original default — bypass the combine so we
      // don't end up in the share capture.
      try { await pactl(["move-sink-input", i.id, state.originalDefaultSink]); } catch { /* */ }
    } else {
      // Anything else should ride the combine so it lands in both speakers
      // and the share capture.
      try {
        await pactl(["move-sink-input", i.id, "redvoice_default"]);
        if (!state.movedSinkInputs.includes(i.id)) state.movedSinkInputs.push(i.id);
      } catch { /* */ }
    }
  }
}

/** Tear down routing. Safe to call when not enabled (no-op). */
export async function disableLinuxAudioRouting(): Promise<void> {
  if (!state) return;
  const s = state;
  state = null;
  if (s.maintainTimer) clearInterval(s.maintainTimer);

  // Move the sink-inputs back to where they came from. Best-effort.
  for (const id of s.movedSinkInputs) {
    try {
      await pactl(["move-sink-input", id, s.originalDefaultSink]);
    } catch { /* sink-input may have closed already */ }
  }

  try { await pactl(["set-default-sink", s.originalDefaultSink]); } catch { /* */ }
  try { await pactl(["unload-module", String(s.combineSinkModuleId)]); } catch { /* */ }
  try { await pactl(["unload-module", String(s.shareSinkModuleId)]); } catch { /* */ }

  safeLog("[linux-audio] routing torn down, default restored to", s.originalDefaultSink);
}

export function registerLinuxAudioRoutingHandlers(): void {
  ipcMain.handle("linux-audio-routing:enable", async () => {
    const result = await enableLinuxAudioRouting();
    return result;
  });
  ipcMain.handle("linux-audio-routing:disable", async () => {
    await disableLinuxAudioRouting();
  });
}

// Cleanup on quit so we don't strand the user's audio config if they close
// the app while routing is active.
app.on("will-quit", () => {
  void disableLinuxAudioRouting();
});
