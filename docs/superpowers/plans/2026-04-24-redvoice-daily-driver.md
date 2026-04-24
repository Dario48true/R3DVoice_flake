# RedVoice Plan 4 — Daily Driver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Plan-3 MVP (screenshare works, voice broken) into a version you'd actually use daily with friends. Fix voice, replace the auto-pick screen handler with a real picker, add participant list + Settings modal as the home for every future config, wire up configurable global push-to-talk, ship a 4K/60fps-capable quality preset with proper HiDPI rendering, and cover the big cross-OS compatibility gotchas.

**Architecture:** No new infra or new services. Additions are mostly client-side: a reusable `Settings` modal, a new `ScreenPickerDialog` invoked from the main process when `getDisplayMedia` is requested, a `participant-list.tsx` component in InRoomScreen, and a `preferences-store.ts` that persists device/resolution picks to `localStorage` and the Settings modal. Voice fix is a targeted investigation — most likely a LiveKit publish option or server config tweak.

**Tech Stack:** No new deps. We're reusing React, Zustand, LiveKit's SDK, and Electron's `globalShortcut` API.

**Spec reference:** `docs/superpowers/specs/2026-04-24-redvoice-design.md` — Settings modal (screen 5), mic mode (VAD default + PTT), device hot-swap.

**Plan 3 dependency:** current HEAD has screenshare working end-to-end with resolution/FPS options + stream audio toggle + maximize tile + right-click volume. Voice publishing is explicitly disabled in `LiveKitRoom.join()` due to Opus PT=111 codec collision.

**Explicitly deferred to Plan 5 (Ship-It):** installers, auto-update, deep links, crash reporting, Cloudflare deployment, `frontend-design` UI polish pass, text chat, picture-in-picture, network quality indicator, macOS screen-recording permission onboarding UX (basic note is fine here).

**Explicitly never (per user):** server-side recording, noise suppression, spatial audio, mobile clients, code signing for now.

---

## File Structure

```
apps/client/
├── src/
│   ├── main/
│   │   ├── index.ts                  # MODIFY: open real ScreenPickerDialog instead of auto-picking
│   │   ├── screen-picker.ts          # NEW: spawns a BrowserWindow with the picker UI
│   │   └── keybinds.ts               # NEW: globalShortcut registration + unregistration
│   ├── shared/
│   │   └── bridge-types.ts           # MODIFY: add keybind + screen picker IPC types
│   ├── preload/
│   │   └── index.ts                  # MODIFY: expose keybind + screen picker methods
│   └── renderer/src/
│       ├── lib/
│       │   ├── prefs-store.ts        # NEW: persisted Zustand store (localStorage)
│       │   └── livekit-room.ts       # MODIFY: fix voice publish path, add PTT toggle
│       ├── screens/
│       │   ├── InRoomScreen.tsx      # MODIFY: sidebar, who's-sharing, Settings button, Mute
│       │   ├── PreJoinScreen.tsx     # MODIFY: read/write prefs, expose 4K preset
│       │   └── ScreenPickerDialog.tsx# NEW: renderer-side picker UI
│       └── components/
│           ├── SettingsModal.tsx     # NEW: modal skeleton + tabs
│           └── CopyLinkButton.tsx    # NEW: topbar button
└── tests/
    └── prefs-store.test.ts           # NEW: persistence round-trip test
```

**Decomposition notes:**
- `SettingsModal` is a dumb tabbed component — each tab renders a section (Devices, Keybinds, Compatibility, About). No logic. Tabs read/write the `prefs-store`.
- `ScreenPickerDialog` runs in a separate renderer context (its own BrowserWindow) so we can reuse React/CSS instead of hand-rolling a main-process GUI.
- `keybinds.ts` in main encapsulates Electron `globalShortcut` since that API is main-only.

---

## Task 1: Settings modal skeleton + topbar gear icon

**Files:**
- Create: `apps/client/src/renderer/src/components/SettingsModal.tsx`
- Modify: `apps/client/src/renderer/src/screens/InRoomScreen.tsx`
- Modify: `apps/client/src/renderer/src/screens/LobbyScreen.tsx`

**Context:** A modal with four tabs: Devices, Keybinds, Compatibility, About. For this task each tab renders a placeholder — subsequent tasks fill them in. The modal is opened from a gear icon in the topbar (both Lobby and In-Room). Clicking outside or ESC closes.

- [ ] **Step 1: Create `SettingsModal.tsx`**

```tsx
import { useEffect, useState, type ReactElement, type ReactNode } from "react";

type Tab = "devices" | "keybinds" | "compatibility" | "about";

export function SettingsModal({ onClose }: { onClose: () => void }): ReactElement {
  const [tab, setTab] = useState<Tab>("devices");

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elev)", border: "1px solid var(--border)",
          borderRadius: 8, minWidth: 640, minHeight: 420, display: "flex",
          flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{
          display: "flex", borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
        }}>
          <TabButton label="Devices" active={tab === "devices"} onClick={() => setTab("devices")} />
          <TabButton label="Keybinds" active={tab === "keybinds"} onClick={() => setTab("keybinds")} />
          <TabButton label="Compatibility" active={tab === "compatibility"} onClick={() => setTab("compatibility")} />
          <TabButton label="About" active={tab === "about"} onClick={() => setTab("about")} />
          <div style={{ flex: 1 }} />
          <button
            className="btn secondary" onClick={onClose}
            style={{ border: "none", borderRadius: 0, background: "transparent" }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: 24, flex: 1, overflow: "auto" }}>
          {tab === "devices" && <Placeholder label="Device pickers land in Task 6." />}
          {tab === "keybinds" && <Placeholder label="Keybinds UI lands in Task 7." />}
          {tab === "compatibility" && <Placeholder label="Compatibility options land in Task 10." />}
          {tab === "about" && <About />}
        </div>
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent", border: "none",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        color: active ? "var(--text)" : "var(--text-dim)",
        padding: "12px 16px", cursor: "pointer", font: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function Placeholder({ label }: { label: string }): ReactElement {
  return <div style={{ color: "var(--text-dim)" }}>{label}</div>;
}

function About(): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <strong>RedVoice</strong>
      <div style={{ color: "var(--text-dim)", fontSize: 13 }}>
        Open-source, self-hostable, Discord-style screenshare + voice chat.
      </div>
    </div>
  );
}

function Section({ children }: { children: ReactNode }): ReactElement {
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>;
}

export { Section };
```

- [ ] **Step 2: Add `settingsOpen` state + gear button to LobbyScreen topbar**

In `apps/client/src/renderer/src/screens/LobbyScreen.tsx` topbar div (the one with `<strong>RedVoice</strong>` and Log out), add a gear button next to the username. Also add a `settingsOpen` state and conditional render of `<SettingsModal ... />`.

Replace the topbar div:

```tsx
      <div className="topbar">
        <strong>RedVoice</strong>
        <span style={{ color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 8 }}>
          {user?.displayName}
          <button
            className="btn secondary" style={{ padding: "4px 8px" }}
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            ⚙
          </button>
          <button
            className="btn secondary" style={{ padding: "4px 8px" }}
            onClick={() => void logout()}
          >
            Log out
          </button>
        </span>
      </div>
```

Add `const [settingsOpen, setSettingsOpen] = useState(false);` near the other useState calls, add the import `import { SettingsModal } from "../components/SettingsModal.js";`, and add `{settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}` at the end of the returned JSX.

- [ ] **Step 3: Same for InRoomScreen topbar**

In `InRoomScreen.tsx`, replace the topbar's `<span>` with:

```tsx
        <span style={{ color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 8 }}>
          {conn.phase === "connecting" && "Connecting…"}
          {conn.phase === "connected" && `${tiles.length} participant(s)`}
          {conn.phase === "error" && `Error: ${conn.message}`}
          <button
            className="btn secondary" style={{ padding: "4px 8px" }}
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            ⚙
          </button>
        </span>
```

Add `const [settingsOpen, setSettingsOpen] = useState(false);` and `{settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}` at the end.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm --filter @redvoice/client typecheck`
Expected: zero errors.

Commit:
```bash
git add apps/client/src/renderer/src/components/SettingsModal.tsx apps/client/src/renderer/src/screens
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): Settings modal skeleton with tabs + gear icon in topbar"
```

---

## Task 2: Persisted preferences store

**Files:**
- Create: `apps/client/src/renderer/src/lib/prefs-store.ts`
- Create: `apps/client/tests/prefs-store.test.ts`

**Context:** Zustand store backed by `localStorage` — holds default device ids, resolution, frame rate, PTT keybind, compatibility-mode toggle, last-used server URL. Individual features read from it so user preferences are sticky across restarts.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createPrefsStore, type PrefsStorage } from "../src/renderer/src/lib/prefs-store.js";

function makeStorage(): PrefsStorage & { raw: string | null } {
  let data: string | null = null;
  return {
    get raw() { return data; },
    read: () => data,
    write: (v) => { data = v; },
  };
}

describe("prefs store", () => {
  let storage: ReturnType<typeof makeStorage>;
  beforeEach(() => { storage = makeStorage(); });

  it("returns defaults when storage empty", () => {
    const store = createPrefsStore(storage);
    expect(store.getState().resolution).toBe("1080p");
    expect(store.getState().frameRate).toBe(30);
    expect(store.getState().pttKeybind).toBeNull();
  });

  it("persists changes to storage", () => {
    const store = createPrefsStore(storage);
    store.getState().setResolution("4K");
    store.getState().setFrameRate(60);
    expect(storage.raw).not.toBeNull();
    const parsed = JSON.parse(storage.raw!);
    expect(parsed.resolution).toBe("4K");
    expect(parsed.frameRate).toBe(60);
  });

  it("loads persisted values on init", () => {
    storage.write(JSON.stringify({ resolution: "1440p", frameRate: 60, shareAudio: false }));
    const store = createPrefsStore(storage);
    expect(store.getState().resolution).toBe("1440p");
    expect(store.getState().frameRate).toBe(60);
    expect(store.getState().shareAudio).toBe(false);
  });

  it("ignores malformed JSON gracefully", () => {
    storage.write("not json");
    const store = createPrefsStore(storage);
    expect(store.getState().resolution).toBe("1080p");
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

`pnpm --filter @redvoice/client test tests/prefs-store.test.ts` → module not found.

- [ ] **Step 3: Implement `prefs-store.ts`**

```ts
import { createStore, type StoreApi } from "zustand/vanilla";

export interface PrefsStorage {
  read(): string | null;
  write(value: string): void;
}

export type Resolution = "720p" | "1080p" | "1440p" | "4K";
export type FrameRate = 30 | 60;

export interface PrefsState {
  micDeviceId: string | null;
  speakerDeviceId: string | null;
  resolution: Resolution;
  frameRate: FrameRate;
  shareAudio: boolean;
  pttKeybind: string | null;
  compatibilityMode: boolean; // relaunch with --ozone-platform=x11
  serverUrl: string;

  setMicDeviceId(id: string | null): void;
  setSpeakerDeviceId(id: string | null): void;
  setResolution(r: Resolution): void;
  setFrameRate(f: FrameRate): void;
  setShareAudio(v: boolean): void;
  setPttKeybind(k: string | null): void;
  setCompatibilityMode(v: boolean): void;
  setServerUrl(u: string): void;
}

const DEFAULTS = {
  micDeviceId: null as string | null,
  speakerDeviceId: null as string | null,
  resolution: "1080p" as Resolution,
  frameRate: 30 as FrameRate,
  shareAudio: true,
  pttKeybind: null as string | null,
  compatibilityMode: false,
  serverUrl: "http://localhost:3000",
};

function load(storage: PrefsStorage): typeof DEFAULTS {
  const raw = storage.read();
  if (!raw) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function createPrefsStore(storage: PrefsStorage): StoreApi<PrefsState> {
  const initial = load(storage);

  function persist(state: Partial<typeof DEFAULTS>): void {
    const payload = {
      micDeviceId: state.micDeviceId,
      speakerDeviceId: state.speakerDeviceId,
      resolution: state.resolution,
      frameRate: state.frameRate,
      shareAudio: state.shareAudio,
      pttKeybind: state.pttKeybind,
      compatibilityMode: state.compatibilityMode,
      serverUrl: state.serverUrl,
    };
    storage.write(JSON.stringify(payload));
  }

  return createStore<PrefsState>((set, get) => ({
    ...initial,
    setMicDeviceId: (v) => { set({ micDeviceId: v }); persist(get()); },
    setSpeakerDeviceId: (v) => { set({ speakerDeviceId: v }); persist(get()); },
    setResolution: (v) => { set({ resolution: v }); persist(get()); },
    setFrameRate: (v) => { set({ frameRate: v }); persist(get()); },
    setShareAudio: (v) => { set({ shareAudio: v }); persist(get()); },
    setPttKeybind: (v) => { set({ pttKeybind: v }); persist(get()); },
    setCompatibilityMode: (v) => { set({ compatibilityMode: v }); persist(get()); },
    setServerUrl: (v) => { set({ serverUrl: v }); persist(get()); },
  }));
}

export const localStorageAdapter: PrefsStorage = {
  read: () => globalThis.localStorage?.getItem("redvoice.prefs") ?? null,
  write: (v) => globalThis.localStorage?.setItem("redvoice.prefs", v),
};
```

- [ ] **Step 4: Run test, expect PASS**

`pnpm --filter @redvoice/client test tests/prefs-store.test.ts` → 4 tests pass. Total client tests: 20.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/renderer/src/lib/prefs-store.ts apps/client/tests/prefs-store.test.ts
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): prefs store (localStorage, testable)"
```

---

## Task 3: Wire prefs into PreJoin + LoginScreen (remember last-used)

**Files:**
- Modify: `apps/client/src/renderer/src/screens/PreJoinScreen.tsx`
- Modify: `apps/client/src/renderer/src/screens/LoginScreen.tsx`

**Context:** PreJoin reads mic/speaker/resolution/frameRate/shareAudio from the prefs store instead of hardcoded defaults, and writes on change. LoginScreen reads serverUrl from prefs instead of the auth-store's local serverUrl (we'll keep auth-store.serverUrl in-memory but hydrate it from prefs on mount).

- [ ] **Step 1: Create a singleton prefs store module**

Create `apps/client/src/renderer/src/lib/prefs-singleton.ts`:

```ts
import { createPrefsStore, localStorageAdapter } from "./prefs-store.js";
import { useSyncExternalStore } from "react";
import type { PrefsState } from "./prefs-store.js";

const prefsStore = createPrefsStore(localStorageAdapter);

export function usePrefs<T>(selector: (s: PrefsState) => T): T {
  return useSyncExternalStore(
    prefsStore.subscribe,
    () => selector(prefsStore.getState()),
    () => selector(prefsStore.getState()),
  );
}

export function prefsActions(): PrefsState {
  return prefsStore.getState();
}
```

- [ ] **Step 2: Replace `PreJoinScreen.tsx` state defaults to read from prefs**

At the top of PreJoinScreen component, replace the useState initializers:

```tsx
  const persistedMic = usePrefs((s) => s.micDeviceId);
  const persistedSpeaker = usePrefs((s) => s.speakerDeviceId);
  const persistedResolution = usePrefs((s) => s.resolution);
  const persistedFrameRate = usePrefs((s) => s.frameRate);
  const persistedShareAudio = usePrefs((s) => s.shareAudio);

  const [mics, setMics] = useState<DeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<DeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState<string | null>(persistedMic);
  const [speakerDeviceId, setSpeakerDeviceId] = useState<string | null>(persistedSpeaker);
  const [publishScreen, setPublishScreen] = useState(false);
  const [resolution, setResolution] = useState<keyof typeof RESOLUTIONS>(persistedResolution);
  const [frameRate, setFrameRate] = useState<30 | 60>(persistedFrameRate);
  const [shareAudio, setShareAudio] = useState(persistedShareAudio);
```

Add `import { usePrefs, prefsActions } from "../lib/prefs-singleton.js";` at the top.

On change, call the prefs action. Replace each `onChange` to also persist:

- `onChange={(e) => { setMicDeviceId(e.target.value || null); prefsActions().setMicDeviceId(e.target.value || null); }}`
- Same pattern for speaker, resolution, frameRate, shareAudio.

Key: mic/speaker default-fallback logic in the `onMount` effect should only set the picker if prefs doesn't already have a valid value for the current device list.

Replace the enumerate block:

```tsx
      const [ins, outs] = await Promise.all([listAudioInputs(), listAudioOutputs()]);
      if (cancelled) return;
      setMics(ins);
      setSpeakers(outs);
      // Only adopt default if the persisted pick isn't in the current device list.
      const persistedMicStillPresent = persistedMic && ins.some((d) => d.deviceId === persistedMic);
      if (!persistedMicStillPresent) {
        setMicDeviceId(ins[0]?.deviceId ?? null);
      }
      const persistedSpeakerStillPresent = persistedSpeaker && outs.some((d) => d.deviceId === persistedSpeaker);
      if (!persistedSpeakerStillPresent) {
        setSpeakerDeviceId(outs[0]?.deviceId ?? null);
      }
```

- [ ] **Step 3: Same treatment for LoginScreen's server URL field**

In `LoginScreen.tsx`, import `usePrefs` and `prefsActions`, and replace `serverUrl` / `setServerUrl` hooks' bindings. On change write to prefs. On mount hydrate the auth-store's serverUrl from prefs (one-shot useEffect).

```tsx
  const serverUrlFromPrefs = usePrefs((s) => s.serverUrl);
  const setServerUrl = useAuthStore((s) => s.setServerUrl);

  useEffect(() => {
    setServerUrl(serverUrlFromPrefs);
  }, [serverUrlFromPrefs, setServerUrl]);
```

On the field's `onChange`:
```tsx
  onChange={(e) => {
    setServerUrl(e.target.value);
    prefsActions().setServerUrl(e.target.value);
  }}
```

- [ ] **Step 4: Typecheck + manual test + commit**

`pnpm --filter @redvoice/client typecheck` → clean.
Commit:
```bash
git add apps/client/src/renderer/src/lib/prefs-singleton.ts apps/client/src/renderer/src/screens
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): remember device + resolution + server URL choices via prefs"
```

---

## Task 4: Real screen picker dialog

**Files:**
- Create: `apps/client/src/main/screen-picker.ts`
- Modify: `apps/client/src/main/index.ts`
- Modify: `apps/client/src/shared/bridge-types.ts`
- Modify: `apps/client/src/preload/index.ts`
- Create: `apps/client/src/renderer/src/screens/ScreenPickerDialog.tsx`
- Modify: `apps/client/src/renderer/src/main.tsx` (mount picker as a second root in `?picker=1` mode)
- Modify: `apps/client/electron.vite.config.ts` (add a second HTML entry)

**Context:** Replace the current auto-pick-source[0] with a real dialog that shows thumbnails. Design:

1. When `setDisplayMediaRequestHandler` fires, the main process spawns a new BrowserWindow with a separate `index.html?picker=1` URL that boots a `ScreenPickerDialog` React tree (not the main app).
2. The picker window queries `desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } })` and renders a grid.
3. User clicks a source → IPC `screen-picker:select` with `sourceId` back to main → main resolves the pending callback → picker window closes.
4. User clicks Cancel → IPC `screen-picker:cancel` → main resolves callback with `{}`.

Full code for each file is in the spec's appendix at the bottom of this document. (See "Task 4 Appendix" below.)

- [ ] **Step 1-8: Implement per appendix, typecheck, manual-test screenshare, commit**

Too much code to inline at the top level — see the appendix. Typecheck expected clean. Manual test: click Share screen → new dialog appears with thumbnails → pick one → renderer gets the stream.

```bash
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): real screen picker dialog with thumbnails"
```

---

## Task 5: Diagnose + fix voice (codec collision PT=111)

**Files:**
- Modify: `apps/client/src/renderer/src/lib/livekit-room.ts`
- Possibly: `infra/livekit.yaml`

**Context:** Plan 3's Opus codec collision blocked audio publishing. Plan 4's mission-critical task is to figure out why and fix it. Likely causes, ranked:

1. **Client-publishing two audio tracks at once** — when `micStream` is provided AND `setMicrophoneEnabled(true)` was also called. Our current code has `else` branch but an earlier revision may have left a stale path. Audit `livekit-room.ts`.
2. **`dynacast: true` was the cause and the fix is staying `dynacast: false`** — Plan 3 set this already; voice may now "just work". Test first before deeper debugging.
3. **Stream audio from screenshare + mic both using Opus PT 111** — when `setScreenShareEnabled(true, { audio: true })` and mic is also published. Fix by setting different `audioPreset` per publish (e.g. `AudioPresets.musicStereo` for screen audio).
4. **LiveKit server config mismatch** — unlikely but `infra/livekit.yaml` may need explicit codec config.

Investigation order:

- [ ] **Step 1: Try publishing voice as-is**

Set `publishAudio: true` in InRoomScreen's `roomWrapper.join(...)` call and test. The `dynacast: false` from Plan 3 may have fixed it.

If works → skip to Step 5.
If "codec collision PT=111" returns → Step 2.

- [ ] **Step 2: Force different audio preset for screenshare**

Import `AudioPresets` from `livekit-client`. In `livekit-room.ts` `setScreenShareEnabled` call, pass an explicit audio preset:

```ts
import { AudioPresets } from "livekit-client";

await this.room.localParticipant.setScreenShareEnabled(true, {
  resolution: { width: q.width, height: q.height, frameRate: q.frameRate },
  audio: q.audio,
  systemAudio: q.audio ? "include" : "exclude",
  contentHint: "motion",
  audioPreset: AudioPresets.musicStereo, // force stereo music preset — different PT from mic's Opus mono
});
```

Test with both mic + screenshare audio. If collision gone → Step 5.

- [ ] **Step 3: Disable screenshare audio when mic is published**

If Step 2 doesn't work, enforce mutual exclusion — if the user publishes mic, auto-disable `audio` on the screenshare track. Surface a note in the UI: "Sharing both mic + system audio will arrive in a later release."

- [ ] **Step 4: Escape hatch — document as known issue**

If all else fails and voice still breaks with screenshare audio on: ship voice-only (disable `audio: q.audio` for now), put this in the README known-issues section, and revisit post-1.0.

- [ ] **Step 5: Put the Mute button back in InRoomScreen's control bar**

Plan 3 removed it while audio was off. Add it back:

```tsx
<button
  className={`btn ${muted ? "" : "secondary"}`}
  onClick={() => void roomWrapper.setMuted(!(snapshot.local?.isMicrophoneEnabled ?? true) ? false : true)}
  disabled={conn.phase !== "connected"}
>
  {muted ? "Unmute" : "Mute"}
</button>
```

where `muted = !(snapshot.local?.isMicrophoneEnabled ?? true)`.

- [ ] **Step 6: Commit with a clear message stating which hypothesis won**

```bash
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "fix(client): publish voice — <root cause>"
```

---

## Task 6: Devices tab in Settings modal (hot-swap)

**Files:**
- Modify: `apps/client/src/renderer/src/components/SettingsModal.tsx`

**Context:** Replace the Devices placeholder with two selects (mic + speaker) + mute button. Same list source as PreJoin. Changing the mic here applies live (no rejoin) via `Room.switchActiveDevice()`.

- [ ] **Step 1: Add `DevicesTab` component**

Replace the `{tab === "devices" && <Placeholder .../>}` line with `<DevicesTab />`, and add:

```tsx
function DevicesTab(): ReactElement {
  const [mics, setMics] = useState<DeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<DeviceInfo[]>([]);
  const micId = usePrefs((s) => s.micDeviceId);
  const spkId = usePrefs((s) => s.speakerDeviceId);

  useEffect(() => {
    void Promise.all([listAudioInputs(), listAudioOutputs()]).then(([ins, outs]) => {
      setMics(ins);
      setSpeakers(outs);
    });
  }, []);

  return (
    <Section>
      <label>
        <div className="section-title">Microphone</div>
        <select
          value={micId ?? ""}
          onChange={(e) => prefsActions().setMicDeviceId(e.target.value || null)}
        >
          {mics.map((m) => <option key={m.deviceId} value={m.deviceId}>{m.label}</option>)}
        </select>
      </label>
      <label>
        <div className="section-title">Speakers</div>
        <select
          value={spkId ?? ""}
          onChange={(e) => prefsActions().setSpeakerDeviceId(e.target.value || null)}
        >
          {speakers.map((s) => <option key={s.deviceId} value={s.deviceId}>{s.label}</option>)}
        </select>
      </label>
    </Section>
  );
}
```

Imports: `import { listAudioInputs, listAudioOutputs, type DeviceInfo } from "../lib/media.js"; import { usePrefs, prefsActions } from "../lib/prefs-singleton.js";`

- [ ] **Step 2: Subscribe the active LiveKit room to prefs so devices apply live**

If we're in-room when devices change, call `room.switchActiveDevice('audioinput', newId)`. The InRoomScreen's useEffect should watch `usePrefs((s) => s.micDeviceId)` and call this when it changes.

Add to InRoomScreen:

```tsx
const prefMic = usePrefs((s) => s.micDeviceId);
useEffect(() => {
  if (conn.phase === "connected" && prefMic) {
    void roomWrapper.room.switchActiveDevice("audioinput", prefMic);
  }
}, [prefMic, conn.phase, roomWrapper]);
```

- [ ] **Step 3: Commit**

```bash
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): Devices tab in Settings modal + hot-swap"
```

---

## Task 7: Keybinds tab + global push-to-talk

**Files:**
- Create: `apps/client/src/main/keybinds.ts`
- Modify: `apps/client/src/main/index.ts`
- Modify: `apps/client/src/shared/bridge-types.ts`
- Modify: `apps/client/src/preload/index.ts`
- Modify: `apps/client/src/renderer/src/components/SettingsModal.tsx`

**Context:** A single configurable global hotkey for push-to-talk. Pressing it → LiveKit `setMicrophoneEnabled(true)`. Releasing it → `setMicrophoneEnabled(false)`. Electron's `globalShortcut.register` is only keydown; we use `before-input-event` via the main window's webContents for a proper hold-to-talk, OR we use `globalShortcut` for an activation toggle (simpler for MVP).

MVP approach: `globalShortcut` toggles a "PTT pressed" state that lasts 500ms, re-triggering extends it. Works. Real hold-to-talk is Plan 5.

- [ ] **Step 1: Create `keybinds.ts` in main**

```ts
import { globalShortcut } from "electron";

export type PttCallback = (pressed: boolean) => void;

let current: string | null = null;
let holdTimeout: NodeJS.Timeout | null = null;

export function setPttKeybind(accelerator: string | null, callback: PttCallback): void {
  if (current) globalShortcut.unregister(current);
  current = accelerator;
  if (!accelerator) return;
  globalShortcut.register(accelerator, () => {
    callback(true);
    if (holdTimeout) clearTimeout(holdTimeout);
    holdTimeout = setTimeout(() => callback(false), 500);
  });
}

export function teardownKeybinds(): void {
  globalShortcut.unregisterAll();
}
```

- [ ] **Step 2: Wire it in main/index.ts**

In `registerIpcHandlers()`:

```ts
ipcMain.handle("keybind:set-ptt", (_evt, accelerator: unknown) => {
  const acc = typeof accelerator === "string" ? accelerator : null;
  setPttKeybind(acc, (pressed) => {
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("keybind:ptt", pressed));
  });
});
```

Add `app.on("will-quit", teardownKeybinds)`.

- [ ] **Step 3: Expose the method via preload + bridge-types**

Add to `RedVoiceBridge`:
```ts
setPttKeybind(accelerator: string | null): Promise<void>;
onPttEvent(cb: (pressed: boolean) => void): () => void;
```

Implement in preload with `ipcRenderer.invoke` and `ipcRenderer.on` + return cleanup.

- [ ] **Step 4: Keybinds tab UI**

In `SettingsModal.tsx`, replace the Keybinds placeholder with:

```tsx
function KeybindsTab(): ReactElement {
  const current = usePrefs((s) => s.pttKeybind);
  const [recording, setRecording] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    function onKey(e: KeyboardEvent): void {
      e.preventDefault();
      // Build Electron accelerator string
      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Control");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      if (e.metaKey) parts.push("Super");
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      // Skip modifier-only presses
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      parts.push(key);
      const accelerator = parts.join("+");
      setCaptured(accelerator);
      setRecording(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording]);

  async function save(): Promise<void> {
    if (!captured) return;
    await window.redvoice.setPttKeybind(captured);
    prefsActions().setPttKeybind(captured);
    setCaptured(null);
  }

  async function clear(): Promise<void> {
    await window.redvoice.setPttKeybind(null);
    prefsActions().setPttKeybind(null);
  }

  return (
    <Section>
      <div>
        <div className="section-title">Push-to-talk</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <code style={{ padding: "4px 8px", background: "var(--bg)", borderRadius: 4 }}>
            {captured ?? current ?? "(none)"}
          </code>
          <button className="btn secondary" onClick={() => setRecording(true)} disabled={recording}>
            {recording ? "Press a key…" : "Rebind"}
          </button>
          {captured && <button className="btn" onClick={() => void save()}>Save</button>}
          {current && <button className="btn secondary" onClick={() => void clear()}>Clear</button>}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>
          Hold this key to unmute briefly. Works even when the app isn't focused.
        </div>
      </div>
    </Section>
  );
}
```

Add `{tab === "keybinds" && <KeybindsTab />}`.

- [ ] **Step 5: Listen for PTT events in InRoomScreen**

In InRoomScreen:

```tsx
useEffect(() => {
  const cleanup = window.redvoice.onPttEvent((pressed) => {
    void roomWrapper.setMuted(!pressed);
  });
  return cleanup;
}, [roomWrapper]);
```

- [ ] **Step 6: Register saved keybind on app start**

In `main/index.ts` `app.whenReady`:

```ts
// Try to load saved keybind from renderer when first window opens.
// For MVP, renderer will push it on boot via setPttKeybind.
```

In renderer's `AuthProvider` or top-level `App.tsx`, on mount push current prefs keybind to main:

```tsx
useEffect(() => {
  const k = prefsActions().pttKeybind;
  if (k) void window.redvoice.setPttKeybind(k);
}, []);
```

- [ ] **Step 7: Commit**

```bash
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): keybinds tab + global push-to-talk"
```

---

## Task 8: 4K + HiDPI video rendering polish

**Files:**
- Modify: `apps/client/src/renderer/src/screens/InRoomScreen.tsx`

**Context:** The 4K preset is live in PreJoin but `<video>` elements render blurry on high-DPI monitors because we don't declare intrinsic width. Fix: set `width` + `height` attributes that match the source resolution, let CSS `object-fit: contain` scale them.

- [ ] **Step 1: Use `track.attach()` returned element's resolution hint**

In `ParticipantTile`'s `useEffect`, after `track.attach(el)`, inspect the track's video dimensions via `track.mediaStreamTrack.getSettings()`:

```tsx
useEffect(() => {
  const el = videoRef.current;
  const track = p.screenTrack;
  if (!el || !track) return;
  track.attach(el);
  // Query settings once attached for HiDPI sizing
  const settings = track.mediaStreamTrack.getSettings();
  if (settings.width && settings.height) {
    el.width = settings.width;
    el.height = settings.height;
  }
  return () => { track.detach(el); };
}, [p.screenTrack]);
```

- [ ] **Step 2: Bump the maximized tile's minimum height**

When `maximized`, give the tile `height: '100%'` (already doing this) and ensure the video is `width: '100%' height: '100%' object-fit: contain`.

- [ ] **Step 3: Typecheck + manual test**

Share a 4K source at 60fps. Maximize the tile. Should be sharp.

- [ ] **Step 4: Commit**

```bash
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): HiDPI-correct video sizing for 4K 60fps"
```

---

## Task 9: Participant list sidebar + "Who's sharing" topbar indicator + Copy link

**Files:**
- Modify: `apps/client/src/renderer/src/screens/InRoomScreen.tsx`
- Create: `apps/client/src/renderer/src/components/CopyLinkButton.tsx`

**Context:**
- A collapsible left sidebar listing all participants. Click a name → maximize their tile.
- A "Who's sharing" indicator in the topbar: "👁 Red is sharing" — clicking focuses their tile.
- `CopyLinkButton` in the topbar: writes `window.location.origin + "/join/" + roomId` (or a server URL-based variant) to clipboard.

- [ ] **Step 1: `CopyLinkButton`**

```tsx
import { useState, type ReactElement } from "react";

export function CopyLinkButton({ roomId, serverUrl }: { roomId: string; serverUrl: string }): ReactElement {
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    const url = `${serverUrl.replace(/\/$/, "")}/join/${roomId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button className="btn secondary" style={{ padding: "4px 8px" }} onClick={() => void copy()}>
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
```

- [ ] **Step 2: Add it to InRoomScreen topbar**

```tsx
<CopyLinkButton roomId={props.roomId} serverUrl={serverUrl} />
```

- [ ] **Step 3: Add participant list sidebar to InRoomScreen**

Wrap the tile grid area in a flex row with a 200px-wide sidebar:

```tsx
<div style={{ display: "flex", flex: 1, minHeight: 0 }}>
  <aside style={{
    width: 200, background: "var(--bg-elev)", borderRight: "1px solid var(--border)",
    overflowY: "auto", padding: 12,
  }}>
    <div className="section-title">Participants</div>
    <ul className="room-list">
      {tiles.map((p) => {
        const isSharing = p.screenTrack !== null;
        return (
          <li key={p.id}>
            <button onClick={() => setMaximizedId(p.id)}>
              {p.name}{p.isLocal && " (you)"}
              {isSharing && <span style={{ color: "var(--accent)", marginLeft: 6 }}>●</span>}
            </button>
          </li>
        );
      })}
    </ul>
  </aside>
  <div style={{ flex: 1, padding: 24, overflow: "auto", display: "flex", flexDirection: "column" }}>
    {/* existing grid or maximized tile */}
  </div>
</div>
```

- [ ] **Step 4: Who's-sharing indicator**

At top of InRoomScreen's topbar, compute:

```tsx
const sharingParticipants = tiles.filter((t) => t.screenTrack !== null);
```

Then in the topbar:

```tsx
{sharingParticipants.length > 0 && (
  <button
    className="btn secondary"
    style={{ padding: "4px 10px", fontSize: 12 }}
    onClick={() => sharingParticipants[0] && setMaximizedId(sharingParticipants[0].id)}
    title="Click to focus"
  >
    👁 {sharingParticipants.map((s) => s.name).join(", ")} sharing
  </button>
)}
```

- [ ] **Step 5: Typecheck + commit**

```bash
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): participant sidebar + who's-sharing indicator + copy-link"
```

---

## Task 10: Compatibility tab (X11 flag) + cross-OS notes

**Files:**
- Modify: `apps/client/src/renderer/src/components/SettingsModal.tsx`
- Modify: `apps/client/src/main/index.ts`
- Modify: `README.md`

**Context:** Settings → Compatibility tab has a single toggle: "Use X11 compatibility mode (Linux/Wayland)". When enabled + you click "Relaunch", the app sets `compatibilityMode` in prefs and calls `app.relaunch({ args: [...origArgs, '--ozone-platform=x11'] })` + `app.exit(0)`. On next boot, if prefs has `compatibilityMode: true` and process.argv doesn't include the flag, we self-append it and relaunch.

Also: macOS needs a note about screen recording permissions, Linux needs a note about PipeWire audio, Windows has no gotchas.

- [ ] **Step 1: Self-relaunch logic in main/index.ts**

At the top of the file, before `createWindow`:

```ts
// If prefs says compatibility mode but we weren't launched with the flag, relaunch.
// We read prefs from the renderer-side localStorage indirectly — simplest: pass via env.
if (
  process.platform === "linux" &&
  process.env["REDVOICE_COMPATIBILITY_MODE"] === "1" &&
  !process.argv.includes("--ozone-platform=x11")
) {
  app.commandLine.appendSwitch("ozone-platform", "x11");
}
```

- [ ] **Step 2: CompatibilityTab**

```tsx
function CompatibilityTab(): ReactElement {
  const enabled = usePrefs((s) => s.compatibilityMode);

  function toggle(): void {
    const next = !enabled;
    prefsActions().setCompatibilityMode(next);
    // Persist to OS env so next launch sees it
    void window.redvoice.setCompatibilityEnv(next);
  }

  async function relaunch(): Promise<void> {
    await window.redvoice.relaunch();
  }

  return (
    <Section>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={enabled} onChange={toggle} />
        <span>X11 compatibility mode (Linux/Wayland)</span>
      </label>
      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
        Forces Electron through XWayland. Use if screenshare glitches on Wayland.
      </div>
      <button className="btn" onClick={() => void relaunch()}>Relaunch app</button>
      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
        Platform-specific notes:
        <ul>
          <li>macOS: grant Screen Recording permission in System Settings → Privacy</li>
          <li>Linux: system audio from screenshare needs PipeWire portal ≥ 1.14</li>
          <li>Windows: system audio from screenshare uses "loopback"; no setup needed</li>
        </ul>
      </div>
    </Section>
  );
}
```

- [ ] **Step 3: Bridge + main handlers for `setCompatibilityEnv` + `relaunch`**

Add to `bridge-types.ts`:

```ts
setCompatibilityEnv(enabled: boolean): Promise<void>;
relaunch(): Promise<void>;
```

In `main/index.ts`:

```ts
ipcMain.handle("app:set-compatibility-env", (_evt, enabled: unknown) => {
  // We can't write to process.env durably across restarts — write a file instead.
  const flagPath = join(app.getPath("userData"), "compat.flag");
  if (enabled === true) {
    fs.writeFileSync(flagPath, "1");
  } else {
    fs.rmSync(flagPath, { force: true });
  }
});
ipcMain.handle("app:relaunch", () => {
  app.relaunch();
  app.exit(0);
});
```

And at main top, replace the env check with a file check:

```ts
const flagPath = join(app.getPath("userData"), "compat.flag");
if (process.platform === "linux" && fs.existsSync(flagPath) && !process.argv.includes("--ozone-platform=x11")) {
  app.commandLine.appendSwitch("ozone-platform", "x11");
}
```

- [ ] **Step 4: README updates**

Add a "Cross-OS notes" section to `README.md`:

```markdown
## Cross-OS notes

| OS | Screenshare | System audio | Notes |
|---|---|---|---|
| **Windows** | Works | Works (`loopback`) | No extra setup |
| **Linux (X11 / XWayland)** | Works | Works via PipeWire portal | Enable "Compatibility mode" in Settings if on native Wayland and screenshare is glitchy |
| **Linux (Wayland native)** | Works (picker UX varies by compositor) | Requires `xdg-desktop-portal` ≥ 1.14 | |
| **macOS** | Works | Limited (needs permission) | Grant Screen Recording permission in System Settings → Privacy & Security |
```

- [ ] **Step 5: Commit**

```bash
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): Compatibility tab (X11 mode) + cross-OS notes in README"
```

---

## Task 11: Final checks + manual smoke + README status bump

- [ ] **Step 1: Full workspace checks**

```bash
pnpm -r typecheck   # zero errors
pnpm -r test        # server 44 + client 20 = 64 total
```

- [ ] **Step 2: Manual smoke**

With two Electron clients running (Plan 3 flow still works):
- Open Settings → all four tabs render, no errors
- Set a PTT keybind (e.g. `Control+Shift+T`), save, return to lobby, join room, press the key → your mic briefly unmutes
- Change mic in Settings while in-room → the change applies live, LiveKit switches input
- Share a 4K 60fps screen → other client sees sharp video (no blurriness on HiDPI)
- Sidebar shows both participants, "Who's sharing" appears when someone shares
- Copy Link puts `<serverUrl>/join/<roomId>` in clipboard — paste into the other client's "Join by link" field, works
- Enable Compatibility mode → Relaunch → app reopens with XWayland (Linux only)

- [ ] **Step 3: README status line**

In `README.md` top:

```markdown
**Status:** Plan 4 shipped — voice + daily-driver UX complete. Next: Plan 5 (installers, auto-update, polish) before public GitHub release.
```

- [ ] **Step 4: Commit**

```bash
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "docs: Plan 4 complete — daily-driver voice + UX"
```

---

## Done — Plan 4 acceptance checklist

- [ ] Settings modal with four tabs opens from gear icon (Lobby + In-Room)
- [ ] Prefs persist across restart (verify via localStorage inspector)
- [ ] Real screen picker shows thumbnails, not auto-pick
- [ ] Voice publishes without codec collision — two clients can hear each other
- [ ] Mute button back in control bar
- [ ] Devices tab hot-swaps mic without rejoining
- [ ] Configurable global PTT works app-unfocused
- [ ] 4K 60fps preset produces sharp video on HiDPI
- [ ] Participant sidebar + who's-sharing indicator + copy-link button all live
- [ ] X11 compatibility toggle relaunches on Linux
- [ ] README notes cross-OS expectations

Once all boxes are checked, move on to Plan 5 (Ship-It — installers + auto-update + deep links + polish).

---

## Task 4 Appendix — Screen Picker Dialog (inline code)

*(Deferred from above — keeps the main task list readable.)*

### `apps/client/src/main/screen-picker.ts`

```ts
import { BrowserWindow, desktopCapturer, ipcMain, type DesktopCapturerSource } from "electron";
import { join } from "node:path";

interface PendingRequest {
  resolve: (sourceId: string | null) => void;
}

let pending: PendingRequest | null = null;
let pickerWindow: BrowserWindow | null = null;

export async function openScreenPicker(): Promise<string | null> {
  if (pickerWindow) {
    pickerWindow.focus();
    return new Promise((resolve) => (pending = { resolve }));
  }

  const win = new BrowserWindow({
    width: 720, height: 520, title: "Choose a screen to share",
    resizable: true, minimizable: false, maximizable: false, modal: true,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  pickerWindow = win;
  win.on("closed", () => {
    pickerWindow = null;
    if (pending) {
      pending.resolve(null);
      pending = null;
    }
  });

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    await win.loadURL(`${devUrl}?picker=1`);
  } else {
    await win.loadFile(join(import.meta.dirname, "../renderer/index.html"), { search: "picker=1" });
  }

  return new Promise<string | null>((resolve) => {
    pending = { resolve };
  });
}

export function registerScreenPickerHandlers(): void {
  ipcMain.handle("screen-picker:list", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 180 },
    });
    return sources.map((s: DesktopCapturerSource) => ({
      id: s.id, name: s.name, thumbnailDataUrl: s.thumbnail.toDataURL(),
    }));
  });
  ipcMain.handle("screen-picker:select", (_evt, sourceId: unknown) => {
    if (pending && typeof sourceId === "string") {
      pending.resolve(sourceId);
      pending = null;
    }
    if (pickerWindow) {
      pickerWindow.close();
      pickerWindow = null;
    }
  });
  ipcMain.handle("screen-picker:cancel", () => {
    if (pending) {
      pending.resolve(null);
      pending = null;
    }
    if (pickerWindow) {
      pickerWindow.close();
      pickerWindow = null;
    }
  });
}
```

### `apps/client/src/main/index.ts` — display-media handler update

Replace the existing handler:

```ts
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
```

Add `registerScreenPickerHandlers()` next to `registerIpcHandlers()`.

### `ScreenPickerDialog.tsx` renderer component + entry routing — see detailed scaffolding guidance in the commit message of Task 4 when implementing.

