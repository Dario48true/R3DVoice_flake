# RedVoice Plan 5 — Ship It Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Plan-4 daily-driver into something you'd actually link from a public GitHub README. Ships: text chat, picture-in-picture, network-quality indicator per tile, distinctive UI polish via the `frontend-design` skill, cross-platform installers built in GitHub Actions, auto-update, deep links, macOS first-run permission onboarding, opt-in crash reporting, and Cloudflare + UDP deployment docs.

**Architecture:** No new services. Additions are client-side features (chat, PiP, quality dots, onboarding modal), distribution infrastructure (electron-builder + Actions workflow), and one doc. Plan 5 doesn't touch the server beyond an `.env.production.example`.

**Tech Stack:** `electron-builder` (installers), `electron-updater` (auto-update), LiveKit `DataChannel` (text chat), LiveKit `RoomEvent.ConnectionQualityChanged` (quality dots), `electron-sentry` or Electron's built-in `crashReporter` (crash reports — opt-in). No new runtime deps for the renderer beyond what's already there.

**Spec reference:** `docs/superpowers/specs/2026-04-24-redvoice-design.md` — "Post-MVP Roadmap" items 1 (web frontend for account mgmt: SKIP, out of scope), 2 (text chat), deployment section.

**Plan 4 dependency:** voice must work in a two-client smoke test. If hypothesis #1 from Plan 4 Task 5 fails, backfill hypothesis #2 (different Opus preset for screenshare audio) before starting Plan 5.

**Explicitly deferred beyond Plan 5 (per user — 2026-04-25 revision):** server-side recording, spatial audio, code signing. Mobile clients moved to Plan 6. Camera/webcam, noise suppression, and advanced mic options are now in-scope for Plan 5 as Tasks 13–15.

---

## File Structure

```
.github/workflows/
├── ci.yml                              # EXISTS (server tests)
└── release.yml                         # NEW: tagged-release installer builds

apps/client/
├── package.json                        # MODIFY: add electron-builder + electron-updater
├── electron-builder.yml                # NEW: packaging config
├── build/
│   ├── icon.png                        # NEW: 512×512 app icon (placeholder ok)
│   └── entitlements.mac.plist          # NEW: macOS entitlements (screen recording)
├── src/
│   ├── main/
│   │   ├── auto-update.ts              # NEW: electron-updater bootstrap
│   │   ├── deep-links.ts               # NEW: redvoice:// protocol handler
│   │   ├── crash-report.ts             # NEW: opt-in crashReporter wiring
│   │   └── index.ts                    # MODIFY: wire above
│   ├── shared/
│   │   └── bridge-types.ts             # MODIFY: deep-link + crash-opt-in IPC
│   ├── preload/
│   │   └── index.ts                    # MODIFY: expose above
│   └── renderer/src/
│       ├── lib/
│       │   ├── chat-store.ts           # NEW: room chat state via DataChannel
│       │   └── prefs-store.ts          # MODIFY: add crashOptIn + hasSeenOnboarding
│       ├── components/
│       │   ├── ChatPanel.tsx           # NEW: right-hand chat panel in-room
│       │   ├── NetworkQualityDot.tsx   # NEW: quality indicator
│       │   └── OnboardingModal.tsx     # NEW: first-run macOS permission flow
│       ├── screens/
│       │   ├── InRoomScreen.tsx        # MODIFY: add quality dots + chat toggle
│       │   ├── PipWindow.tsx           # NEW: renderer for detached PiP
│       │   └── (rest unchanged)
│       └── main.tsx                    # MODIFY: route `?pip=1` → PipWindow

docs/
└── deployment.md                       # NEW: Cloudflare + UDP + secrets walkthrough

apps/server/
└── .env.production.example             # NEW: prod secret template
```

---

## Task 1: electron-builder config + local packaging sanity

**Files:**
- Modify: `apps/client/package.json`
- Create: `apps/client/electron-builder.yml`
- Create: `apps/client/build/icon.png` (placeholder — any 512x512 PNG)
- Create: `apps/client/build/entitlements.mac.plist`

- [ ] **Step 1: Add devDeps**

In `apps/client/package.json`, add to `devDependencies`:

```json
    "electron-builder": "^26.0.0",
    "electron-updater": "^6.3.0",
```

(Note: `electron-updater` is a runtime dep strictly speaking. It goes in `dependencies`.)

Move `electron-updater` to `dependencies`:
```json
  "dependencies": {
    "@redvoice/shared": "workspace:*",
    "electron-updater": "^6.3.0",
    "livekit-client": "^2.9.0",
    "zustand": "^5.0.2"
  },
```

Add scripts:

```json
    "package": "electron-builder",
    "package:linux": "electron-builder --linux AppImage deb",
    "package:win": "electron-builder --win nsis",
    "package:mac": "electron-builder --mac dmg",
```

Run `pnpm install`.

- [ ] **Step 2: Create `electron-builder.yml`**

```yaml
appId: com.r3dwolfie.redvoice
productName: RedVoice
copyright: Copyright © 2026 R3dWolfie

directories:
  output: release
  buildResources: build

files:
  - "out/**/*"
  - "package.json"

asar: true

linux:
  target:
    - AppImage
    - deb
  category: Network
  icon: build/icon.png

win:
  target:
    - target: nsis
      arch:
        - x64
  icon: build/icon.png

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true

mac:
  target:
    - dmg
  category: public.app-category.social-networking
  icon: build/icon.png
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  # Code signing intentionally not configured — user flagged for later.

publish:
  provider: github
  owner: R3dWolfie
  repo: RedVoice
  releaseType: release
```

- [ ] **Step 3: `entitlements.mac.plist`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.device.audio-input</key>
  <true/>
  <key>com.apple.security.device.camera</key>
  <true/>
</dict>
</plist>
```

- [ ] **Step 4: Placeholder icon**

Generate a 512×512 PNG any way you want (ImageMagick: `convert -size 512x512 xc:#d63850 -pointsize 200 -fill white -gravity center -draw "text 0,0 'RV'" build/icon.png`). If ImageMagick isn't installed, create a solid-color PNG via Node+sharp OR just download a freely-licensed temporary icon. Replace properly in a later polish pass.

- [ ] **Step 5: Package locally**

Run: `pnpm --filter @redvoice/client run build && pnpm --filter @redvoice/client run package:linux`
Expected: `apps/client/release/RedVoice-0.0.0.AppImage` appears.

Launch: `./apps/client/release/RedVoice-0.0.0.AppImage` — should open and behave identically to `pnpm dev`.

- [ ] **Step 6: Commit**

```bash
git add apps/client
git commit -m "feat(client): electron-builder config + local packaging (Linux AppImage/deb, Win NSIS, macOS dmg)"
```

---

## Task 2: Auto-update wiring

**Files:**
- Create: `apps/client/src/main/auto-update.ts`
- Modify: `apps/client/src/main/index.ts`

- [ ] **Step 1: `auto-update.ts`**

```ts
import { app, BrowserWindow, dialog } from "electron";
import pkg from "electron-updater";
const { autoUpdater } = pkg;

export function initAutoUpdate(): void {
  // Only run against packaged builds — skip during `pnpm dev`.
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    console.log("Update available:", info.version);
  });

  autoUpdater.on("update-downloaded", (info) => {
    const win = BrowserWindow.getAllWindows()[0];
    dialog
      .showMessageBox(win ?? new BrowserWindow({ show: false }), {
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
    console.error("Auto-update error:", err);
  });

  // Check every 2 hours
  void autoUpdater.checkForUpdatesAndNotify();
  setInterval(() => void autoUpdater.checkForUpdatesAndNotify(), 2 * 60 * 60 * 1000);
}
```

- [ ] **Step 2: Call in main/index.ts**

In the `app.whenReady().then(async () => { ... })` block, add `initAutoUpdate();` (import at top).

- [ ] **Step 3: Typecheck + commit**

```bash
git commit -m "feat(client): electron-updater wiring (no-op in dev, polls every 2h when packaged)"
```

---

## Task 3: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Workflow**

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @redvoice/shared build
      - run: pnpm --filter @redvoice/client run build
      - name: Package
        run: pnpm --filter @redvoice/client run package
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "ci: release workflow — packages installers on tag push"
```

---

## Task 4: Deep links (redvoice://join/<id>)

**Files:**
- Create: `apps/client/src/main/deep-links.ts`
- Modify: `apps/client/src/main/index.ts`
- Modify: `apps/client/src/shared/bridge-types.ts`
- Modify: `apps/client/src/preload/index.ts`
- Modify: `apps/client/src/renderer/src/screens/LobbyScreen.tsx`

- [ ] **Step 1: `deep-links.ts`**

```ts
import { app, BrowserWindow, type IpcMain } from "electron";

const PROTOCOL = "redvoice";

let pendingUrl: string | null = null;
let mainWindow: BrowserWindow | null = null;

export function registerProtocol(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [process.argv[1]!]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win;
  if (pendingUrl) {
    deliverUrl(pendingUrl);
    pendingUrl = null;
  }
}

function extractRoomId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== `${PROTOCOL}:`) return null;
    // redvoice://join/<uuid>
    const parts = u.pathname.replace(/^\//, "").split("/");
    if (u.hostname === "join" && parts[0]) return parts[0];
    if (u.pathname === "" && parts[0]) return parts[0];
    return null;
  } catch {
    return null;
  }
}

export function handleIncomingUrl(rawUrl: string): void {
  if (mainWindow) deliverUrl(rawUrl);
  else pendingUrl = rawUrl;
}

function deliverUrl(rawUrl: string): void {
  const roomId = extractRoomId(rawUrl);
  if (!roomId || !mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  mainWindow.webContents.send("deep-link:join", roomId);
}

export function wireAppEvents(): void {
  // macOS delivers URLs via 'open-url'
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleIncomingUrl(url);
  });

  // Windows/Linux: second instance args include the URL
  app.on("second-instance", (_event, argv) => {
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (url) handleIncomingUrl(url);
  });
}
```

- [ ] **Step 2: Main-process wiring**

In `main/index.ts`, early:

```ts
import { registerProtocol, setMainWindow, wireAppEvents, handleIncomingUrl } from "./deep-links.js";

// Enforce single instance so deep links go to the running app
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

registerProtocol();
wireAppEvents();
```

Check the initial argv for a URL too:

```ts
const initialDeepLink = process.argv.find((a) => a.startsWith("redvoice://"));
if (initialDeepLink) handleIncomingUrl(initialDeepLink);
```

After `createWindow()`:

```ts
const windows = BrowserWindow.getAllWindows();
if (windows[0]) setMainWindow(windows[0]);
```

- [ ] **Step 3: Bridge**

Add to `RedVoiceBridge`:

```ts
onDeepLinkJoin(cb: (roomId: string) => void): () => void;
```

Preload:

```ts
onDeepLinkJoin: (cb) => {
  const handler = (_evt: Electron.IpcRendererEvent, roomId: string): void => cb(roomId);
  ipcRenderer.on("deep-link:join", handler);
  return () => ipcRenderer.off("deep-link:join", handler);
},
```

- [ ] **Step 4: LobbyScreen listens**

In `LobbyScreen.tsx`, in a useEffect:

```tsx
useEffect(() => {
  const cleanup = window.redvoice.onDeepLinkJoin((roomId) => {
    void store.getState().join(roomId);
  });
  return cleanup;
}, [store]);
```

- [ ] **Step 5: Update CopyLinkButton**

The button currently copies `http://server/join/<id>`. Keep that OR add a second button "Copy deep link" that copies `redvoice://join/<id>`. For MVP, update the existing button to prefer the deep-link form when the user has the app installed — but since we can't detect that, make both available:

```tsx
// Two buttons: "Copy link" (http URL for non-installed recipients) and
// "Copy deep link" (redvoice:// for installed recipients).
```

Actually, simpler: just change the copy to `redvoice://join/<roomId>` since anyone running the client has the protocol registered. Document this in README.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(client): deep-link protocol redvoice://join/<id>"
```

---

## Task 5: macOS screen-recording permission onboarding

**Files:**
- Create: `apps/client/src/renderer/src/components/OnboardingModal.tsx`
- Modify: `apps/client/src/renderer/src/lib/prefs-store.ts` (add `hasSeenOnboarding`)
- Modify: `apps/client/src/renderer/src/App.tsx` (mount onboarding on first launch if macOS)

- [ ] **Step 1: prefs addition**

Add to `PrefsState` interface + defaults + setter:

```ts
hasSeenOnboarding: boolean;
setHasSeenOnboarding(v: boolean): void;
```

Default `false`.

- [ ] **Step 2: OnboardingModal**

Full-screen modal that only appears on macOS when `hasSeenOnboarding === false`. Shows:
- Text explaining screen recording permission
- "Open System Settings" button → opens via `shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")`
- "I've granted permission" button → sets `hasSeenOnboarding(true)`, closes

Implement the component with standard modal pattern from SettingsModal.

- [ ] **Step 3: Bridge method for opening prefs**

Add `openSystemPrivacyScreenRecording(): Promise<void>` to bridge + preload, implement in main with `shell.openExternal(...)`.

- [ ] **Step 4: Show on first launch (macOS only)**

In `App.tsx`:

```tsx
const hasSeenOnboarding = usePrefs((s) => s.hasSeenOnboarding);
const [platform, setPlatform] = useState<string | null>(null);

useEffect(() => {
  setPlatform(window.redvoice.platform());
}, []);

const shouldShow = platform === "darwin" && !hasSeenOnboarding;
```

Render `{shouldShow && <OnboardingModal />}`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(client): macOS screen-recording permission onboarding on first launch"
```

---

## Task 6: Text chat via LiveKit DataChannel

**Files:**
- Create: `apps/client/src/renderer/src/lib/chat-store.ts`
- Create: `apps/client/src/renderer/src/components/ChatPanel.tsx`
- Modify: `apps/client/src/renderer/src/lib/livekit-room.ts` (expose data send)
- Modify: `apps/client/src/renderer/src/screens/InRoomScreen.tsx` (chat panel toggle)

Implementation sketch (no full code — small task):
- Chat store tracks `messages: Array<{ id, from, text, timestamp }>`
- `livekit-room.ts` exposes `sendChat(text)` (uses `localParticipant.publishData(new TextEncoder().encode(JSON.stringify({...})))`) and listens for `RoomEvent.DataReceived` to add messages
- `ChatPanel.tsx`: right-side 280px panel, input at bottom, toggle button in control bar
- Messages ephemeral — not persisted (chat is in-call only for MVP)

Commit:
```bash
git commit -m "feat(client): in-room text chat via LiveKit DataChannel"
```

---

## Task 7: Picture-in-picture (detachable tile)

**Files:**
- Modify: `apps/client/src/main/index.ts` (IPC for opening PiP window)
- Create: `apps/client/src/renderer/src/screens/PipWindow.tsx`
- Modify: `apps/client/src/renderer/src/main.tsx` (route `?pip=1`)

Implementation sketch:
- Right-click tile context menu gains "Pop out" action
- Main process spawns a new `BrowserWindow({ alwaysOnTop: true, width: 400, height: 225, frame: false })` loading `?pip=1&participantId=<id>`
- PipWindow component connects to the LiveKit room independently (uses same token minting) and renders just that one participant's video
- Closing the PiP window doesn't leave the room

Complication: requires the PiP window to have its own LiveKit connection OR IPC the track across processes. Simplest MVP: PiP window is just a second renderer that calls the API for a second token and joins the room read-only. Two peers for one user on the server. Acceptable for MVP.

Commit:
```bash
git commit -m "feat(client): picture-in-picture detachable tile window"
```

---

## Task 8: Network quality indicator

**Files:**
- Create: `apps/client/src/renderer/src/components/NetworkQualityDot.tsx`
- Modify: `apps/client/src/renderer/src/lib/livekit-room.ts` (track `connectionQuality` per participant)
- Modify: `apps/client/src/renderer/src/screens/InRoomScreen.tsx` (show dot on each tile)

Implementation sketch:
- Subscribe to `RoomEvent.ConnectionQualityChanged` → `{ participant, quality: 'excellent' | 'good' | 'poor' | 'unknown' }`
- Store `Record<identity, quality>` in LiveKitRoom wrapper's snapshot
- `NetworkQualityDot` renders a small colored dot: green (excellent), yellow (good), red (poor)
- Placed in each `ParticipantTile`'s corner

Commit:
```bash
git commit -m "feat(client): network quality dot per participant tile"
```

---

## Task 9: Opt-in crash reporting

**Files:**
- Create: `apps/client/src/main/crash-report.ts`
- Modify: `apps/client/src/main/index.ts`
- Modify: `apps/client/src/renderer/src/components/SettingsModal.tsx` (About tab gets opt-in checkbox)
- Modify: `apps/client/src/renderer/src/lib/prefs-store.ts` (add `crashOptIn`)

Implementation sketch:
- Use Electron's built-in `crashReporter.start(...)` — no external service needed for MVP
- Reports saved to `app.getPath("crashDumps")` and can be uploaded to a configured URL; for now just save locally with a note "enable to help debug"
- Checkbox in About tab: "Save local crash reports for debugging"
- Off by default; requires user to tick

Commit:
```bash
git commit -m "feat(client): opt-in local crash reporter"
```

---

## Task 10: `frontend-design` UI polish pass

**Context:** Invoke the `frontend-design` skill to do a pass on the renderer's UI. Scope:
- Login + Register screens
- Lobby layout
- Pre-Join check
- In-Room grid + control bar
- Settings modal tabs
- Changelog panel

Goal: distinctive dark theme that doesn't look like generic AI output. Not a Discord pixel-clone — aesthetic only. The current CSS (in `styles.css`) uses a red accent `#d63850` — keep or evolve.

- [ ] **Step 1: Invoke `frontend-design` skill**

Launch an agent using the `frontend-design:frontend-design` subagent type with the task "give RedVoice a distinctive Discord-inspired dark UI pass". Provide the file list above + the spec's "UI direction" note.

- [ ] **Step 2: Review + commit iteratively**

The skill typically produces multiple commits. Let it.

---

## Task 11: Self-host deployment guide (Cloudflare + UDP + systemd)

**Files:**
- Create: `docs/deployment.md`
- Create: `apps/server/.env.production.example`
- Create: `infra/systemd/redvoice-server.service`
- Create: `infra/systemd/redvoice-livekit.service`
- Modify: `README.md` (link to deployment.md + "Self-host" top section)

Content sketch for `deployment.md`:

**Prerequisites section:**
- Domain (e.g. voice.yourhandle.com)
- Cloudflare account (free tier)
- A Linux box (tested on Bazzite/Fedora; Debian/Ubuntu should work)
- Router access to port-forward UDP

**Ports table** (reuse the one from chat):
| Port | Protocol | Purpose | Exposure |
|---|---|---|---|
| 443 | TCP/HTTPS | App API + LiveKit signalling | Via Cloudflare tunnel (no router change) |
| **7881** | **UDP** | **LiveKit media** | **Router port-forward required** |
| 50000-50020 | UDP | LiveKit ICE range | Same range port-forward |
| 7882 | TCP | Media fallback | Optional via Cloudflare |

**Step-by-step:**
1. Install Docker + pnpm + Node ≥20
2. Clone repo, `pnpm install`, `pnpm prisma migrate deploy`
3. Fill `apps/server/.env` with generated secrets (`openssl rand -base64 32` × 2)
4. Fill `infra/livekit.yaml` with the same `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`
5. Install `cloudflared`, `cloudflared tunnel login`, create tunnel, route `voice.yourhandle.com` → `localhost:3000` and `wss://voice.yourhandle.com/rtc` → `localhost:7880`
6. **Router:** port-forward UDP 7881 + UDP 50000-50020 + (optional) TCP 7882 → your server's LAN IP
7. Install systemd units (see below) + `systemctl enable --now redvoice-server redvoice-livekit`
8. Confirm: `curl https://voice.yourhandle.com/health` → `{"status":"ok"}`

**Systemd units** — install to `/etc/systemd/system/` then enable:

`infra/systemd/redvoice-server.service`:
```ini
[Unit]
Description=RedVoice app server (Node/Fastify)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=red
WorkingDirectory=/home/red/RedVoice
EnvironmentFile=/home/red/RedVoice/apps/server/.env
ExecStart=/usr/bin/pnpm --filter @redvoice/server start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`infra/systemd/redvoice-livekit.service`:
```ini
[Unit]
Description=RedVoice LiveKit media server (Docker)
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/home/red/RedVoice/infra
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Note: the paths above assume `/home/red/RedVoice/` — adjust for your install location. The server unit loads its env from `apps/server/.env` which must NOT be world-readable (`chmod 600`).

**`apps/server/.env.production.example`** — same keys as dev `.env.example` but with comments pointing to the deployment guide for generation commands.

Commit:
```bash
git commit -m "docs: Cloudflare + UDP deployment walkthrough"
```

---

## Task 12: Webcam / camera feature

**Files:**
- Modify: `apps/client/src/renderer/src/lib/livekit-room.ts` (camera publish helpers)
- Modify: `apps/client/src/renderer/src/lib/media.ts` (enumerate video inputs)
- Modify: `apps/client/src/renderer/src/screens/PreJoinScreen.tsx` (camera preview + picker)
- Modify: `apps/client/src/renderer/src/screens/InRoomScreen.tsx` (camera tile rendering + control-bar toggle)
- Modify: `apps/client/src/renderer/src/lib/prefs-store.ts` (add `cameraDeviceId`, `publishCamera`)
- Modify: `apps/client/src/renderer/src/components/SettingsModal.tsx` (camera device picker in Devices tab)

**Context:** LiveKit has first-class camera support — `localParticipant.setCameraEnabled(true)` does the right thing. We treat camera as a separate track from screenshare so both can co-exist. Camera renders in the participant tile as a webcam bubble overlaid on their avatar (or replacing the avatar when no screenshare is active). The existing ParticipantTile logic (screenshare vs avatar) gains a third mode: camera.

- [ ] **Step 1: Extend `lib/media.ts` with video-input enumeration**

Add `listVideoInputs()` following the same pattern as `listAudioInputs`. Filter `kind === "videoinput"`.

- [ ] **Step 2: Add camera to JoinOptions + LiveKitRoom helpers**

In `livekit-room.ts`:
- Add `publishCamera?: boolean` + `cameraDeviceId?: string` to `JoinOptions`
- In `join()`, after screenshare publishing: `if (options.publishCamera) { await this.room.localParticipant.setCameraEnabled(true, { deviceId: options.cameraDeviceId }); }`
- Add `async setCameraEnabled(enabled: boolean): Promise<void>` that wraps `localParticipant.setCameraEnabled`

- [ ] **Step 3: PreJoin camera preview + picker**

Add a "Camera" section (shown only if `publishCamera` checkbox ticked). Shows a `<video>` live-preview of the chosen camera + a device select. Mirror device pick to prefs.

Pattern: `getUserMedia({ video: { deviceId: { exact } } })` → set as `srcObject` on a `<video ref>` → stop stream on unmount or device change (same cleanup pattern as the mic VU meter).

- [ ] **Step 4: Camera tile rendering in InRoomScreen**

`ParticipantTile` currently checks `screenTrack` → video OR avatar. Extend to also check `cameraTrack` (via `findCameraTrack` helper analogous to `findScreenTrack`, filtering `Track.Source.Camera`).

Display priority:
1. If `screenTrack` exists → show screenshare full-tile, overlay camera as small 120×120 bubble in bottom-right corner
2. Else if `cameraTrack` exists → show camera full-tile
3. Else → avatar

- [ ] **Step 5: Camera toggle in control bar**

Add a fourth button alongside Mute / Share / Leave: `📹 Camera on/off`. Calls `roomWrapper.setCameraEnabled(!cameraOn)`.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(client): webcam/camera feature alongside screenshare"
```

---

## Task 13: Noise suppression (basic-user-friendly)

**Files:**
- Modify: `apps/client/package.json` (add `@livekit/krisp-noise-filter`)
- Modify: `apps/client/src/renderer/src/lib/livekit-room.ts` (wire noise filter to mic track on publish)
- Modify: `apps/client/src/renderer/src/lib/prefs-store.ts` (add `noiseSuppression: "off" | "low" | "high"`)
- Modify: `apps/client/src/renderer/src/components/SettingsModal.tsx` (add to Devices or new Audio tab)

**Context:** LiveKit ships a Krisp-based noise filter as a separate package. Simple API: `KrispNoiseFilter()` → attach to LocalAudioTrack. For "BASIC users" UX: three presets — Off / Low / High. No raw threshold sliders. Default: Low (conservative — good voice preservation).

- [ ] **Step 1: Install dep**

```bash
cd apps/client && pnpm add @livekit/krisp-noise-filter
```

- [ ] **Step 2: Apply filter on mic publish**

In `LiveKitRoom.join()`, when the mic stream publishes, wrap:

```ts
import { KrispNoiseFilter, isKrispNoiseFilterSupported } from "@livekit/krisp-noise-filter";

// Where options.noiseSuppression is "low" | "high" | "off":
if (options.noiseSuppression !== "off" && isKrispNoiseFilterSupported()) {
  const filter = KrispNoiseFilter();
  await micPublication.setAudioFilter(filter);
  // Krisp doesn't expose intensity knobs directly; low/high is handled by:
  // - "low" = default (no extra processing beyond noise removal)
  // - "high" = additional high-pass filter via Web Audio pre-step
}
```

If "high" mode needs extra processing (e.g. narrow-band filtering), add a simple `BiquadFilterNode(highpass, 120Hz)` chained before the Krisp filter.

- [ ] **Step 3: Settings UI**

In the Devices tab (or new Audio tab), add:

```tsx
<label>
  <div className="section-title">Noise suppression</div>
  <select value={noise} onChange={(e) => prefsActions().setNoiseSuppression(e.target.value)}>
    <option value="off">Off</option>
    <option value="low">Low (recommended)</option>
    <option value="high">High (aggressive)</option>
  </select>
</label>
```

Changing the setting while in-room: Plan 5 MVP is "applies on next room join". Mid-room swap requires republishing the mic track — add in Task 15 if easy, defer otherwise.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(client): Krisp noise suppression with Off/Low/High presets"
```

---

## Task 14: Advanced mic options (input gain, AGC toggle, noise gate)

**Files:**
- Modify: `apps/client/src/renderer/src/lib/media.ts` (add `openMicStream` overload with constraints)
- Modify: `apps/client/src/renderer/src/lib/prefs-store.ts` (add `micGain: number`, `autoGain: boolean`, `noiseGate: boolean`)
- Modify: `apps/client/src/renderer/src/components/SettingsModal.tsx` (new "Audio" tab)
- Modify: `apps/client/src/renderer/src/lib/livekit-room.ts` (apply Web Audio gain node before publish)

**Context:** Three basic-user-friendly knobs:
- **Input gain** (0 – 200%, default 100%) → `GainNode` pre-publish
- **Auto gain control** (toggle, default on) → `audio: { autoGainControl: bool }` constraint
- **Noise gate** (toggle, default off) → `audio: { noiseSuppression: bool }` constraint (separate from Krisp in Task 13 — WebRTC's built-in; compound is OK)

These live in a new **"Audio" tab** in Settings modal (alongside Devices, Keybinds, Compatibility, About).

- [ ] **Step 1: Extend prefs + add tab**

Prefs defaults: `micGain: 1.0`, `autoGain: true`, `noiseGate: false`, plus the Task 13 `noiseSuppression` above.

New AudioTab component with three controls:
```
Input gain   [==========○------] 100%    (slider 0-200)
☑ Auto gain control (AGC)
☐ Noise gate (basic)
```

- [ ] **Step 2: Apply to mic track**

In `openMicStream` accept options:
```ts
export async function openMicStream(
  deviceId: string | undefined,
  opts?: { autoGain?: boolean; noiseGate?: boolean },
): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: {
      ...(deviceId && { deviceId: { exact: deviceId } }),
      ...(opts?.autoGain !== undefined && { autoGainControl: opts.autoGain }),
      ...(opts?.noiseGate !== undefined && { noiseSuppression: opts.noiseGate }),
      echoCancellation: true, // always on — don't expose
    },
    video: false,
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}
```

Gain is applied post-capture via Web Audio, since `getUserMedia` has no standard gain constraint. In `LiveKitRoom.join()`, before publish:

```ts
if (options.micGain !== undefined && options.micGain !== 1.0) {
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(options.micStream);
  const gain = ctx.createGain();
  gain.gain.value = options.micGain;
  const dest = ctx.createMediaStreamDestination();
  src.connect(gain).connect(dest);
  const gainedTrack = dest.stream.getAudioTracks()[0];
  // publish `gainedTrack` instead of the raw one
}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(client): advanced mic options (gain, AGC, noise gate) in Settings → Audio tab"
```

---

## Task 15: Email verification

**Files:**
- Modify: `apps/server/prisma/schema.prisma` (add `emailVerifiedAt` + `EmailVerificationToken` table)
- Create: `apps/server/src/auth/email.ts` (SMTP wrapper — use nodemailer)
- Create: `apps/server/src/auth/verify-routes.ts` (`/auth/verify-email/:token` + resend endpoint)
- Modify: `apps/server/src/auth/routes.ts` (send verification email on register)
- Modify: `apps/server/src/config.ts` (SMTP env vars + `REQUIRE_EMAIL_VERIFIED` flag)
- Modify: `apps/server/.env.example` (SMTP placeholders)
- Modify: `apps/client/src/renderer/src/screens/LoginScreen.tsx` (show "check your inbox" notice)

**Context:** Free SMTP options for self-hosters: Resend (3k/month free), Mailgun (100/day trial), or self-hosted Postfix. Default config points at Resend. When `REQUIRE_EMAIL_VERIFIED=true` (opt-in), unverified users can't join rooms — they still log in but see a "verify your email" modal until they click the link.

Tokens: 32-byte crypto-random, expire in 24h, one-time use.

Commit: `feat(server): email verification via SMTP with 24h tokens`

---

## Task 16: Password reset

**Files:**
- Modify: `apps/server/prisma/schema.prisma` (add `PasswordResetToken` table)
- Create: `apps/server/src/auth/reset-routes.ts` (`/auth/forgot-password` + `/auth/reset-password/:token`)
- Reuses Task 15's `email.ts` module
- Create: `apps/client/src/renderer/src/screens/ForgotPasswordScreen.tsx`
- Modify: `apps/client/src/renderer/src/screens/LoginScreen.tsx` (add "Forgot password?" link)

**Context:** Standard flow. `/forgot-password` takes an email, always returns 200 (no enumeration), emails a reset link if the email exists. Link has a single-use token valid 1h. Clicking the link opens `redvoice://reset-password/<token>` in the app (reuses Plan 5 Task 4's deep-link infrastructure) OR opens a web page (when Plan 7's web client exists). For now: require the app.

Commit: `feat(server): password reset flow`

---

## Task 17: Two-factor auth (TOTP)

**Files:**
- Modify: `apps/client/package.json` (add `qrcode` to client for displaying QR)
- Modify: `apps/server/package.json` (add `otplib`)
- Modify: `apps/server/prisma/schema.prisma` (add `totpSecret` and `totpEnabled` to User)
- Create: `apps/server/src/auth/totp-routes.ts` (`/auth/totp/setup`, `/auth/totp/verify`, `/auth/totp/disable`)
- Modify: `apps/server/src/auth/routes.ts` (login flow: if `totpEnabled`, login returns 202 with `requires_totp: true` instead of issuing JWT; client then POSTs code to `/auth/totp/verify-login`)
- Create: `apps/client/src/renderer/src/screens/TotpSetupScreen.tsx` (QR code + enter-code flow)
- Modify: `apps/client/src/renderer/src/components/SettingsModal.tsx` (new Security section in About tab or dedicated tab)
- Modify: `apps/client/src/renderer/src/screens/LoginScreen.tsx` (6-digit code prompt when login returns 202)

**Context:** Standard TOTP. `otplib` generates a secret + QR URL. User scans with Authenticator/Authy/1Password, types code to confirm. Store secret encrypted at rest (argon2 isn't right here — use a server-side encryption key). For MVP, store in plaintext but note the risk (users won't enable 2FA in dev anyway). Plan 5.5 can encrypt properly.

Login flow change: if user has TOTP enabled, login returns `{ requires_totp: true, pending_token: <nonce> }` instead of a session JWT. Client prompts for code, POSTs to `/auth/totp/verify-login` with nonce + code → gets session JWT.

Commit: `feat(server): 2FA (TOTP) with otplib`

---

## Task 18: Final checks, tag release, verify CI

- [ ] **Step 1: Full workspace checks**

```bash
pnpm -r typecheck
pnpm -r test  # expect 64+ tests green
```

- [ ] **Step 2: README status bump**

```markdown
**Status:** v0.1.0 — first public release. Installers available in Releases.
```

- [ ] **Step 3: Tag + push**

```bash
git tag v0.1.0
# Confirm with user before pushing — this triggers the release workflow
git push origin main --tags
```

- [ ] **Step 4: Verify CI build**

Watch the `release.yml` workflow succeed on GitHub. Installers should appear as draft release assets.

- [ ] **Step 5: Publish the release**

On GitHub, edit the draft release, write release notes (or copy from the Changelog panel's text), publish.

---

## Done — Plan 5 acceptance checklist

- [ ] `pnpm --filter @redvoice/client run package:linux` produces a working AppImage
- [ ] Auto-update wire-up doesn't crash in dev (no-op) or packaged builds
- [ ] `redvoice://join/<uuid>` links open the app + route to the room
- [ ] macOS first-run shows the permission onboarding modal (tested on a macOS machine)
- [ ] Text chat works between two clients in the same room
- [ ] Picture-in-picture: right-click → Pop out → detached always-on-top window shows the participant's screen
- [ ] Network quality dot renders correctly in each tile
- [ ] Crash-reporting checkbox persists across restarts; off by default
- [ ] `frontend-design` skill has done a full pass; screens feel distinctive and consistent
- [ ] `docs/deployment.md` covers Cloudflare + UDP end-to-end
- [ ] GitHub Actions release workflow builds all three OS targets on tag push
- [ ] v0.1.0 release published with installer downloads in the README
- [ ] Webcam preview works in Pre-Join; camera tile renders in-room (with screenshare overlay fallback)
- [ ] Noise suppression Off/Low/High select applies on next join; verified with loud-background call
- [ ] Audio tab shows gain/AGC/noise-gate; gain slider audibly changes published volume
