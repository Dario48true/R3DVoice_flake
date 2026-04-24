# RedVoice Plan 3 — Media Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Actual working voice + screenshare. Add a local Dockerized LiveKit server, wire the Electron client to publish mic audio + screenshare + subscribe to remote participants' audio + screenshare, with a Pre-Join device-check screen before entering a room and an In-Room grid view while inside.

**Architecture:** LiveKit SFU runs as a Docker container on `ws://localhost:7880` sharing `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` with the app-server. The client uses `livekit-client` JS SDK — `Room` class handles WebRTC signalling and track publish/subscribe. A thin `livekit-room.ts` wrapper exposes room state via callbacks that plug into React `useEffect`/`useState`. Pre-Join lets the user pick mic / speaker / screenshare source (with a live VU meter); In-Room auto-publishes those choices, renders a tile grid (one tile per participant with talking ring + screenshare video + avatar fallback), and exposes mute/screenshare/leave controls.

**Tech Stack:** LiveKit server 1.x (Docker image), `livekit-client` ^2.9.0 (adds dep to `apps/client`), WebRTC (Chromium built-in), getUserMedia + getDisplayMedia. No new server-side deps — Plan 1's `POST /rooms/:id/token` already mints correct LiveKit tokens.

**Spec reference:** `docs/superpowers/specs/2026-04-24-redvoice-design.md` — "Client Screens" items 3 (Pre-Join), 4 (In-Room); "Mic Mode Details" (VAD default, PTT deferred to Plan 4); "Deployment" (local-only for now; Cloudflare/UDP is Plan 4).

**Explicitly deferred to Plan 4:** Settings modal, push-to-talk + global hotkey, device hot-swap, Caddy reverse proxy, Cloudflare tunnel setup, UDP port-forwarding docs, `frontend-design` visual pass, installer packaging.

**Plan 1 + 2 dependency:** 57 tests green; client talks to server-on-`localhost:3000`. This plan does NOT modify the app-server beyond perhaps a doc tweak — all the work is infrastructure (Docker) + client.

---

## File Structure

```
infra/                                 # NEW — Docker infrastructure
├── docker-compose.yml                 # LiveKit service
├── livekit.yaml                       # LiveKit config (ports, keys, dev mode)
└── README.md                          # How to run the stack

apps/server/
├── .env                               # Updated to use infra secrets (not committed)
└── .env.example                       # Updated with matching placeholder secrets

apps/client/
├── package.json                       # Add livekit-client dep
└── src/renderer/src/
    ├── lib/
    │   ├── media.ts                   # NEW — device enumeration, VU meter, getUserMedia wrappers
    │   └── livekit-room.ts            # NEW — Room wrapper with event-driven state
    └── screens/
        ├── PreJoinScreen.tsx          # NEW — device pickers + VU meter + screenshare picker
        ├── InRoomScreen.tsx           # NEW — tile grid + control bar
        └── LobbyScreen.tsx            # Modified — routes to PreJoin instead of placeholder

apps/client/tests/
└── media.test.ts                      # NEW — tests for pure media utilities
```

**Decomposition notes:**
- `lib/media.ts` is pure DOM-API wrappers (`enumerateDevices`, `createVuMeter`). Testable with mocked `navigator.mediaDevices`.
- `lib/livekit-room.ts` is a stateful wrapper around LiveKit's `Room` class. Not unit-tested in MVP (integration is tested via manual smoke test with two clients).
- The two screens are intentionally kept separate files — each has one responsibility and neither needs to grow large.

---

## Task 1: Docker infrastructure for LiveKit

**Files:**
- Create: `infra/docker-compose.yml`
- Create: `infra/livekit.yaml`
- Create: `infra/README.md`
- Modify: `apps/server/.env.example`
- Modify: `apps/server/.env` (local, not committed)
- Modify: `.gitignore` (ensure `infra/.env` if any is ignored — we'll inline everything for simplicity)

- [ ] **Step 1: Create `infra/livekit.yaml`**

```yaml
# LiveKit local-dev config — this file ships shared dev secrets.
# For production you'll generate new keys and never check them in.
port: 7880
bind_addresses:
  - ""                     # listen on all interfaces inside the container
rtc:
  tcp_port: 7881           # TCP fallback for media
  port_range_start: 50000  # UDP range for media
  port_range_end: 50020
  use_external_ip: false
keys:
  # <api_key>: <api_secret>
  # DEV ONLY — change before exposing to the internet.
  devkey-redvoice: devsecret-redvoice-devsecret-redvoice-32
log_level: info
```

- [ ] **Step 2: Create `infra/docker-compose.yml`**

```yaml
services:
  livekit:
    image: livekit/livekit-server:v1.8
    command: --config /etc/livekit.yaml --dev
    restart: unless-stopped
    network_mode: host   # simplest for dev — media UDP ports need to be reachable
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml:ro
```

Note: `network_mode: host` avoids Docker port-mapping for the 20 UDP ports LiveKit uses. Works on Linux; on macOS/Windows you'd need explicit `ports:` entries (not our target platforms for local dev).

- [ ] **Step 3: Create `infra/README.md`**

```markdown
# RedVoice infra

Local-dev Docker stack for the LiveKit media server.

## Run

```bash
cd infra
docker compose up
```

Leave it running in its own terminal. LiveKit listens on:

- `ws://localhost:7880` — signalling
- `UDP 50000-50020` — media
- `TCP 7881` — media fallback

## Shared dev secrets

`livekit.yaml` contains `devkey-redvoice` / `devsecret-redvoice-...`. The
`apps/server/.env` file must use the same pair so token minting works.

**These are DEV ONLY.** Generate fresh keys for any public deployment —
see Plan 4 for deployment guidance.
```

- [ ] **Step 4: Update `apps/server/.env.example`**

Replace the contents of `apps/server/.env.example` with:

```
# Copy to apps/server/.env and fill in real values.
DATABASE_URL="file:./dev.db"

# Generate: `openssl rand -base64 32`
JWT_SECRET="replace-me-min-32-chars-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

# LiveKit — defaults here match infra/livekit.yaml for local dev.
# In production, generate fresh keys and update both files.
LIVEKIT_URL="ws://localhost:7880"
LIVEKIT_API_KEY="devkey-redvoice"
LIVEKIT_API_SECRET="devsecret-redvoice-devsecret-redvoice-32"
```

- [ ] **Step 5: Update `apps/server/.env` (local, not committed)**

Replace the LiveKit section of `apps/server/.env` to match:

```
LIVEKIT_URL="ws://localhost:7880"
LIVEKIT_API_KEY="devkey-redvoice"
LIVEKIT_API_SECRET="devsecret-redvoice-devsecret-redvoice-32"
```

Leave `DATABASE_URL` and `JWT_SECRET` unchanged.

- [ ] **Step 6: Start the stack and verify**

```bash
cd infra
docker compose up -d
docker compose logs --tail=30 livekit
```

Expected logs: `"starting LiveKit server"` and `"listening on 7880"`. No ERROR lines.

Test LiveKit responds to its HTTP info endpoint:

```bash
curl -s http://localhost:7880
```

Expected: `OK` (LiveKit's default root handler).

- [ ] **Step 7: Verify app-server mints valid tokens for the real LiveKit**

Restart `pnpm server:dev` so it picks up the new env. Then:

```bash
# Register + get a token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"livekit-check@test.local","password":"longenough-pw-123","displayName":"lkcheck"}' \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).token))')

ROOM_ID=$(curl -s -X POST http://localhost:3000/rooms \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"LK check"}' \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).id))')

curl -s -X POST "http://localhost:3000/rooms/$ROOM_ID/token" \
  -H "Authorization: Bearer $TOKEN"
```

Expected: a JSON response with `{ "token": "eyJ...", "url": "ws://localhost:7880", "roomId": "..." }`.

The token is already compatible — Plan 1 built `mintLiveKitToken` to sign with `LIVEKIT_API_SECRET` from env. We just changed the secret to match LiveKit's config.

Clean up the test user if you want: `cd apps/server && pnpm prisma migrate reset --force` (optional).

- [ ] **Step 8: Commit**

```bash
git add infra apps/server/.env.example
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "infra: local Docker LiveKit stack"
```

`apps/server/.env` is gitignored and stays local.

---

## Task 2: Add `livekit-client` dep + media utility module

**Files:**
- Modify: `apps/client/package.json`
- Create: `apps/client/src/renderer/src/lib/media.ts`
- Create: `apps/client/tests/media.test.ts`

**Context:** `media.ts` wraps two browser APIs: `navigator.mediaDevices.enumerateDevices()` for picking mic/speaker/camera, and an Analyser-based helper that returns a VU-meter level 0–1 from any `MediaStreamTrack`. Testable with a stub `navigator.mediaDevices`.

- [ ] **Step 1: Add `livekit-client` to `apps/client/package.json`**

Modify `apps/client/package.json` dependencies block to add `livekit-client`:

```json
  "dependencies": {
    "@redvoice/shared": "workspace:*",
    "livekit-client": "^2.9.0",
    "zustand": "^5.0.2"
  },
```

Run: `pnpm install`
Expected: `livekit-client` and its transitive deps resolve. No version substitutions expected.

- [ ] **Step 2: Write the failing test**

Write to `apps/client/tests/media.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { listAudioInputs, listAudioOutputs } from "../src/renderer/src/lib/media.js";

function makeDevices(kind: "audioinput" | "audiooutput", entries: Array<{ id: string; label: string }>) {
  return entries.map((e) => ({
    deviceId: e.id,
    kind,
    label: e.label,
    groupId: "",
    toJSON: () => ({}),
  }));
}

describe("media device helpers", () => {
  it("listAudioInputs returns only audio inputs", async () => {
    const enumerate = vi.fn().mockResolvedValue([
      ...makeDevices("audioinput", [
        { id: "mic-a", label: "Built-in mic" },
        { id: "mic-b", label: "USB mic" },
      ]),
      ...makeDevices("audiooutput", [{ id: "spk-a", label: "Built-in speakers" }]),
    ]);
    // @ts-expect-error — stubbed
    globalThis.navigator = { mediaDevices: { enumerateDevices: enumerate } };

    const inputs = await listAudioInputs();
    expect(inputs).toEqual([
      { deviceId: "mic-a", label: "Built-in mic" },
      { deviceId: "mic-b", label: "USB mic" },
    ]);
  });

  it("listAudioOutputs returns only audio outputs", async () => {
    const enumerate = vi.fn().mockResolvedValue([
      ...makeDevices("audioinput", [{ id: "mic-a", label: "Built-in mic" }]),
      ...makeDevices("audiooutput", [{ id: "spk-a", label: "Built-in speakers" }]),
    ]);
    // @ts-expect-error — stubbed
    globalThis.navigator = { mediaDevices: { enumerateDevices: enumerate } };

    const outputs = await listAudioOutputs();
    expect(outputs).toEqual([{ deviceId: "spk-a", label: "Built-in speakers" }]);
  });

  it("lists return an empty array when the API is missing", async () => {
    // @ts-expect-error — stubbed
    globalThis.navigator = { mediaDevices: undefined };
    expect(await listAudioInputs()).toEqual([]);
    expect(await listAudioOutputs()).toEqual([]);
  });
});
```

- [ ] **Step 3: Run — expect failure**

Run: `pnpm --filter @redvoice/client test tests/media.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `media.ts`**

Write to `apps/client/src/renderer/src/lib/media.ts`:

```ts
export interface DeviceInfo {
  deviceId: string;
  label: string;
}

async function enumerateByKind(kind: "audioinput" | "audiooutput"): Promise<DeviceInfo[]> {
  const md = globalThis.navigator?.mediaDevices;
  if (!md?.enumerateDevices) return [];
  const devices = await md.enumerateDevices();
  return devices
    .filter((d) => d.kind === kind)
    .map((d) => ({ deviceId: d.deviceId, label: d.label || "(unnamed device)" }));
}

export function listAudioInputs(): Promise<DeviceInfo[]> {
  return enumerateByKind("audioinput");
}

export function listAudioOutputs(): Promise<DeviceInfo[]> {
  return enumerateByKind("audiooutput");
}

/**
 * Subscribe to mic level from a MediaStream track. Returns a cleanup function.
 * `onLevel` is called ~30fps with a 0..1 amplitude estimate (RMS).
 */
export function subscribeMicLevel(
  stream: MediaStream,
  onLevel: (level: number) => void,
): () => void {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  const buf = new Uint8Array(analyser.fftSize);
  let rafId = 0;
  let cancelled = false;

  const tick = (): void => {
    if (cancelled) return;
    analyser.getByteTimeDomainData(buf);
    // RMS: convert 0..255 to -1..1, square, mean, sqrt
    let sum = 0;
    for (let i = 0; i < buf.length; i += 1) {
      const v = (buf[i]! - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    onLevel(Math.min(1, rms * 2)); // scale so normal speech lands around 0.3-0.6
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
    source.disconnect();
    void ctx.close();
  };
}

/** Ask for mic access and return a stream from the given device. Throws on denial. */
export async function openMicStream(deviceId: string | undefined): Promise<MediaStream> {
  if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
    throw new Error("mic unavailable");
  }
  const constraints: MediaStreamConstraints = {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    video: false,
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}
```

- [ ] **Step 5: Run — expect pass**

Run: `pnpm --filter @redvoice/client test tests/media.test.ts`
Expected: 3 tests pass. Full suite: ~16 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/client/package.json apps/client/src/renderer/src/lib/media.ts apps/client/tests/media.test.ts pnpm-lock.yaml
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): media device helpers + VU-meter + livekit-client dep"
```

---

## Task 3: LiveKit `Room` wrapper

**Files:**
- Create: `apps/client/src/renderer/src/lib/livekit-room.ts`

**Context:** A thin stateful wrapper around LiveKit's `Room` class. Exposes an event emitter-ish interface via callbacks that React's `useEffect` can attach to. No tests — this is glue code exercised by manual smoke test.

The wrapper tracks `{ localParticipant, remoteParticipants, isConnected, error }` state and notifies listeners on each change. We keep LiveKit's `Track` / `Participant` types directly in our callbacks — no need to re-wrap their DTOs.

- [ ] **Step 1: Create the wrapper**

Write to `apps/client/src/renderer/src/lib/livekit-room.ts`:

```ts
import {
  Room,
  RoomEvent,
  type RemoteParticipant,
  type LocalParticipant,
  type Track,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";

export interface RoomStateSnapshot {
  connected: boolean;
  local: LocalParticipant | null;
  remotes: RemoteParticipant[];
  error: string | null;
}

export type RoomStateListener = (state: RoomStateSnapshot) => void;

export interface JoinOptions {
  wsUrl: string;
  token: string;
  /** Optional pre-opened MediaStream to publish as mic track. */
  micStream?: MediaStream;
  /** If true, ask LiveKit to also acquire a screenshare track on connect. */
  publishScreen?: boolean;
}

export class LiveKitRoom {
  readonly room: Room;
  private listeners = new Set<RoomStateListener>();
  private connected = false;
  private err: string | null = null;

  constructor() {
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    this.room.on(RoomEvent.Connected, () => {
      this.connected = true;
      this.err = null;
      this.emit();
    });
    this.room.on(RoomEvent.Disconnected, () => {
      this.connected = false;
      this.emit();
    });
    this.room.on(RoomEvent.ParticipantConnected, () => this.emit());
    this.room.on(RoomEvent.ParticipantDisconnected, () => this.emit());
    this.room.on(RoomEvent.TrackSubscribed, () => this.emit());
    this.room.on(RoomEvent.TrackUnsubscribed, () => this.emit());
    this.room.on(RoomEvent.ActiveSpeakersChanged, () => this.emit());
    this.room.on(RoomEvent.LocalTrackPublished, () => this.emit());
    this.room.on(RoomEvent.LocalTrackUnpublished, () => this.emit());
    this.room.on(RoomEvent.ConnectionStateChanged, () => this.emit());
  }

  subscribe(listener: RoomStateListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): RoomStateSnapshot {
    return {
      connected: this.connected,
      local: this.room.localParticipant,
      remotes: Array.from(this.room.remoteParticipants.values()),
      error: this.err,
    };
  }

  private emit(): void {
    const s = this.snapshot();
    for (const l of this.listeners) l(s);
  }

  async join(options: JoinOptions): Promise<void> {
    try {
      await this.room.connect(options.wsUrl, options.token);
    } catch (err) {
      this.err = err instanceof Error ? err.message : "failed to connect";
      this.connected = false;
      this.emit();
      throw err;
    }
    // Publish mic
    if (options.micStream) {
      const [micTrack] = options.micStream.getAudioTracks();
      if (micTrack) {
        await this.room.localParticipant.publishTrack(micTrack, { source: Track.Source.Microphone });
      }
    } else {
      await this.room.localParticipant.setMicrophoneEnabled(true);
    }
    // Publish screenshare
    if (options.publishScreen) {
      await this.room.localParticipant.setScreenShareEnabled(true);
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    await this.room.localParticipant.setMicrophoneEnabled(!muted);
    this.emit();
  }

  async setScreenShare(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setScreenShareEnabled(enabled);
    this.emit();
  }

  async leave(): Promise<void> {
    await this.room.disconnect();
    this.connected = false;
    this.emit();
  }

  /**
   * Attach every subscribed remote audio track to a DOM element for playback.
   * Call once per remote audio track, idempotently. Returns detach function.
   */
  attachRemoteAudio(
    track: RemoteTrack,
    _pub: RemoteTrackPublication,
    _participant: RemoteParticipant,
  ): HTMLAudioElement {
    const element = track.attach() as HTMLAudioElement;
    element.autoplay = true;
    element.playsInline = true;
    return element;
  }
}

// Re-export LiveKit types the UI layer needs directly.
export type { RemoteParticipant, LocalParticipant, RemoteTrack, RemoteTrackPublication } from "livekit-client";
export { Track, RoomEvent } from "livekit-client";
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @redvoice/client typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/renderer/src/lib/livekit-room.ts
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): LiveKitRoom wrapper with event-driven state"
```

---

## Task 4: PreJoinScreen skeleton + route from Lobby

**Files:**
- Create: `apps/client/src/renderer/src/screens/PreJoinScreen.tsx`
- Modify: `apps/client/src/renderer/src/screens/LobbyScreen.tsx`

**Context:** The Lobby currently shows a "Media isn't wired up yet…" placeholder when `activeRoomId` is set. Replace that with the PreJoinScreen. The PreJoin takes `{ roomId, onJoin(prep), onCancel }` where `prep` is the prepared mic + screenshare selections the In-Room screen will consume.

This task is the SKELETON — no device pickers yet, just wire the routing and a barebones form with a "Join now" button that fires `onJoin(...)` with empty selections. Subsequent tasks fill in pickers + VU meter.

- [ ] **Step 1: Create `PreJoinScreen.tsx`**

Write to `apps/client/src/renderer/src/screens/PreJoinScreen.tsx`:

```tsx
import { useState, type ReactElement } from "react";

export interface PreJoinSelection {
  micDeviceId: string | null;
  speakerDeviceId: string | null;
  publishScreen: boolean;
}

export interface PreJoinScreenProps {
  roomId: string;
  onJoin(selection: PreJoinSelection): void;
  onCancel(): void;
}

export function PreJoinScreen(props: PreJoinScreenProps): ReactElement {
  const [busy, setBusy] = useState(false);

  function handleJoin(): void {
    setBusy(true);
    props.onJoin({ micDeviceId: null, speakerDeviceId: null, publishScreen: false });
  }

  return (
    <div className="centered">
      <div className="form" style={{ maxWidth: 480 }}>
        <h2 style={{ margin: 0 }}>Pre-join check</h2>
        <div style={{ color: "var(--text-dim)" }}>Room: {props.roomId}</div>

        <div style={{ color: "var(--text-dim)" }}>
          Device pickers and screenshare source arrive in the next tasks.
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={handleJoin} disabled={busy}>
            {busy ? "Joining…" : "Join now"}
          </button>
          <button className="btn secondary" onClick={props.onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `LobbyScreen.tsx` to route to PreJoin**

Replace the entire contents of `apps/client/src/renderer/src/screens/LobbyScreen.tsx`:

```tsx
import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent, type ReactElement } from "react";
import { ApiClient } from "../lib/api.js";
import { createRoomsStore, type RoomsState } from "../lib/rooms-store.js";
import { useAuthStore } from "../lib/auth-context.js";
import { PreJoinScreen, type PreJoinSelection } from "./PreJoinScreen.js";

function useRoomsStore<T>(store: ReturnType<typeof createRoomsStore>, selector: (s: RoomsState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
}

type Phase =
  | { kind: "lobby" }
  | { kind: "prejoin"; roomId: string }
  | { kind: "inroom"; roomId: string; selection: PreJoinSelection };

export function LobbyScreen(): ReactElement {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);
  const serverUrl = useAuthStore((s) => s.serverUrl);

  const store = useMemo(() => {
    const api = new ApiClient(serverUrl);
    api.setToken(token);
    return createRoomsStore(api);
  }, [serverUrl, token]);

  const owned = useRoomsStore(store, (s) => s.owned);
  const recent = useRoomsStore(store, (s) => s.recent);
  const status = useRoomsStore(store, (s) => s.status);
  const error = useRoomsStore(store, (s) => s.error);
  const activeRoomId = useRoomsStore(store, (s) => s.activeRoomId);

  const [phase, setPhase] = useState<Phase>({ kind: "lobby" });

  useEffect(() => {
    void store.getState().refresh();
  }, [store]);

  // When the rooms-store sets activeRoomId (user clicked a room), transition to prejoin.
  useEffect(() => {
    if (activeRoomId && phase.kind === "lobby") {
      setPhase({ kind: "prejoin", roomId: activeRoomId });
    }
  }, [activeRoomId, phase.kind]);

  const [newRoomName, setNewRoomName] = useState("");
  const [joinInput, setJoinInput] = useState("");

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    await store.getState().create(newRoomName.trim());
    setNewRoomName("");
  }

  async function onJoin(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!joinInput.trim()) return;
    await store.getState().join(joinInput.trim());
  }

  if (phase.kind === "prejoin") {
    return (
      <PreJoinScreen
        roomId={phase.roomId}
        onJoin={(selection) => setPhase({ kind: "inroom", roomId: phase.roomId, selection })}
        onCancel={() => {
          store.getState().clearActive();
          setPhase({ kind: "lobby" });
        }}
      />
    );
  }

  if (phase.kind === "inroom") {
    // Plan 3 Task 8 replaces this with InRoomScreen.
    return (
      <div className="centered">
        <div className="form">
          <h3>In room {phase.roomId}</h3>
          <p style={{ color: "var(--text-dim)" }}>
            Connection wiring (LiveKit) arrives in Task 8.
          </p>
          <button
            className="btn secondary"
            onClick={() => {
              store.getState().clearActive();
              setPhase({ kind: "lobby" });
            }}
          >
            Leave
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <strong>RedVoice</strong>
        <span style={{ color: "var(--text-dim)" }}>
          {user?.displayName} —{" "}
          <button className="btn secondary" style={{ padding: "4px 8px" }} onClick={() => void logout()}>
            Log out
          </button>
        </span>
      </div>

      <div className="lobby">
        <aside>
          <div className="section-title">My rooms</div>
          {owned.length === 0 ? (
            <div style={{ color: "var(--text-dim)" }}>None yet.</div>
          ) : (
            <ul className="room-list">
              {owned.map((r) => (
                <li key={r.id}>
                  <button onClick={() => void store.getState().join(r.id)}>{r.name}</button>
                </li>
              ))}
            </ul>
          )}

          <div className="section-title">Recent</div>
          {recent.length === 0 ? (
            <div style={{ color: "var(--text-dim)" }}>No recent rooms.</div>
          ) : (
            <ul className="room-list">
              {recent.map((r) => (
                <li key={r.id}>
                  <button onClick={() => void store.getState().join(r.id)}>{r.name}</button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main>
          <form className="form" onSubmit={onCreate}>
            <div className="section-title">Create a room</div>
            <input
              placeholder="Room name"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
            />
            <button className="btn" type="submit" disabled={!newRoomName.trim()}>
              Create
            </button>
          </form>

          <form className="form" onSubmit={onJoin}>
            <div className="section-title">Join by link or id</div>
            <input
              placeholder="voice.R3dWolfie.com/join/... or room id"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
            />
            <button className="btn secondary" type="submit" disabled={!joinInput.trim()}>
              Open room
            </button>
          </form>

          {status === "loading" && <div style={{ color: "var(--text-dim)" }}>Loading…</div>}
          {error && <div className="error">{error}</div>}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + test**

Run: `pnpm --filter @redvoice/client typecheck` — no errors.
Run: `pnpm --filter @redvoice/client test` — still green (no regressions).

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/renderer/src/screens/PreJoinScreen.tsx apps/client/src/renderer/src/screens/LobbyScreen.tsx
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): PreJoinScreen skeleton + lobby→prejoin→inroom state machine"
```

---

## Task 5: PreJoin mic + speaker device pickers

**Files:**
- Modify: `apps/client/src/renderer/src/screens/PreJoinScreen.tsx`

**Context:** Populate the two `<select>`s with `listAudioInputs()` / `listAudioOutputs()`. Labels may be empty until the user grants mic permission (browser behavior) — we prompt for mic access up front so labels populate immediately.

- [ ] **Step 1: Replace the entire contents of `PreJoinScreen.tsx`**

Write to `apps/client/src/renderer/src/screens/PreJoinScreen.tsx`:

```tsx
import { useEffect, useState, type ReactElement } from "react";
import { listAudioInputs, listAudioOutputs, openMicStream, type DeviceInfo } from "../lib/media.js";

export interface PreJoinSelection {
  micDeviceId: string | null;
  speakerDeviceId: string | null;
  publishScreen: boolean;
}

export interface PreJoinScreenProps {
  roomId: string;
  onJoin(selection: PreJoinSelection): void;
  onCancel(): void;
}

export function PreJoinScreen(props: PreJoinScreenProps): ReactElement {
  const [mics, setMics] = useState<DeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<DeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState<string | null>(null);
  const [speakerDeviceId, setSpeakerDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // On mount: request mic permission (unlocks device labels) then enumerate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await openMicStream(undefined);
        // Immediately stop the warm-up stream — we'll re-open with the chosen device later.
        stream.getTracks().forEach((t) => t.stop());
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "mic permission denied");
      }
      const [ins, outs] = await Promise.all([listAudioInputs(), listAudioOutputs()]);
      if (cancelled) return;
      setMics(ins);
      setSpeakers(outs);
      setMicDeviceId(ins[0]?.deviceId ?? null);
      setSpeakerDeviceId(outs[0]?.deviceId ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleJoin(): void {
    setBusy(true);
    props.onJoin({ micDeviceId, speakerDeviceId, publishScreen: false });
  }

  return (
    <div className="centered">
      <div className="form" style={{ maxWidth: 480 }}>
        <h2 style={{ margin: 0 }}>Pre-join check</h2>
        <div style={{ color: "var(--text-dim)" }}>Room: {props.roomId}</div>

        <label>
          <div className="section-title">Microphone</div>
          <select
            value={micDeviceId ?? ""}
            onChange={(e) => setMicDeviceId(e.target.value || null)}
          >
            {mics.length === 0 && <option value="">No mic detected</option>}
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>{m.label}</option>
            ))}
          </select>
        </label>

        <label>
          <div className="section-title">Speakers</div>
          <select
            value={speakerDeviceId ?? ""}
            onChange={(e) => setSpeakerDeviceId(e.target.value || null)}
          >
            {speakers.length === 0 && <option value="">Default output</option>}
            {speakers.map((s) => (
              <option key={s.deviceId} value={s.deviceId}>{s.label}</option>
            ))}
          </select>
        </label>

        {error && <div className="error">{error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={handleJoin} disabled={busy || mics.length === 0}>
            {busy ? "Joining…" : "Join now"}
          </button>
          <button className="btn secondary" onClick={props.onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @redvoice/client typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/renderer/src/screens/PreJoinScreen.tsx
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): PreJoin mic + speaker device pickers"
```

---

## Task 6: PreJoin VU meter

**Files:**
- Modify: `apps/client/src/renderer/src/screens/PreJoinScreen.tsx`

**Context:** When the user picks a mic, open a stream from it, hook up `subscribeMicLevel`, render a horizontal bar whose width is `level * 100%`. Cleanup on mic change or unmount.

- [ ] **Step 1: Replace the entire contents of `PreJoinScreen.tsx`**

Write to `apps/client/src/renderer/src/screens/PreJoinScreen.tsx`:

```tsx
import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  listAudioInputs,
  listAudioOutputs,
  openMicStream,
  subscribeMicLevel,
  type DeviceInfo,
} from "../lib/media.js";

export interface PreJoinSelection {
  micDeviceId: string | null;
  speakerDeviceId: string | null;
  publishScreen: boolean;
}

export interface PreJoinScreenProps {
  roomId: string;
  onJoin(selection: PreJoinSelection): void;
  onCancel(): void;
}

export function PreJoinScreen(props: PreJoinScreenProps): ReactElement {
  const [mics, setMics] = useState<DeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<DeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState<string | null>(null);
  const [speakerDeviceId, setSpeakerDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState(0);

  // Ref holds the currently-open warmup stream so we can stop it on cleanup.
  const warmStreamRef = useRef<MediaStream | null>(null);

  // On mount: request mic permission once (unlocks device labels) then enumerate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await openMicStream(undefined);
        stream.getTracks().forEach((t) => t.stop());
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "mic permission denied");
      }
      const [ins, outs] = await Promise.all([listAudioInputs(), listAudioOutputs()]);
      if (cancelled) return;
      setMics(ins);
      setSpeakers(outs);
      setMicDeviceId(ins[0]?.deviceId ?? null);
      setSpeakerDeviceId(outs[0]?.deviceId ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Whenever micDeviceId changes: open stream, subscribe to level.
  useEffect(() => {
    if (!micDeviceId) {
      setLevel(0);
      return;
    }
    let unsubscribe: (() => void) | null = null;
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await openMicStream(micDeviceId);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        warmStreamRef.current = stream;
        unsubscribe = subscribeMicLevel(stream, (lvl) => {
          if (!cancelled) setLevel(lvl);
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "failed to open mic");
      }
    })();
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      warmStreamRef.current = null;
    };
  }, [micDeviceId]);

  function handleJoin(): void {
    setBusy(true);
    props.onJoin({ micDeviceId, speakerDeviceId, publishScreen: false });
  }

  return (
    <div className="centered">
      <div className="form" style={{ maxWidth: 480 }}>
        <h2 style={{ margin: 0 }}>Pre-join check</h2>
        <div style={{ color: "var(--text-dim)" }}>Room: {props.roomId}</div>

        <label>
          <div className="section-title">Microphone</div>
          <select
            value={micDeviceId ?? ""}
            onChange={(e) => setMicDeviceId(e.target.value || null)}
          >
            {mics.length === 0 && <option value="">No mic detected</option>}
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>{m.label}</option>
            ))}
          </select>
          <div
            aria-label="mic level"
            style={{
              marginTop: 6,
              height: 6,
              background: "var(--border)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.round(level * 100)}%`,
                height: "100%",
                background: "var(--accent)",
                transition: "width 60ms linear",
              }}
            />
          </div>
        </label>

        <label>
          <div className="section-title">Speakers</div>
          <select
            value={speakerDeviceId ?? ""}
            onChange={(e) => setSpeakerDeviceId(e.target.value || null)}
          >
            {speakers.length === 0 && <option value="">Default output</option>}
            {speakers.map((s) => (
              <option key={s.deviceId} value={s.deviceId}>{s.label}</option>
            ))}
          </select>
        </label>

        {error && <div className="error">{error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={handleJoin} disabled={busy || mics.length === 0}>
            {busy ? "Joining…" : "Join now"}
          </button>
          <button className="btn secondary" onClick={props.onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @redvoice/client typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/renderer/src/screens/PreJoinScreen.tsx
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): PreJoin live mic VU meter"
```

---

## Task 7: PreJoin screenshare source picker

**Files:**
- Modify: `apps/client/src/renderer/src/screens/PreJoinScreen.tsx`

**Context:** The spec calls for a screenshare source picker with a small preview. Rather than managing a screenshare stream in PreJoin (which would need to be handed off to LiveKit later), we simply offer a toggle: "Share a screen" (will ask on join) or "Don't share". LiveKit's `setScreenShareEnabled(true)` triggers the Chromium screen picker natively. Keeping the choice as a boolean keeps state simple and matches standard Discord UX.

- [ ] **Step 1: Replace the entire contents of `PreJoinScreen.tsx`**

Write to `apps/client/src/renderer/src/screens/PreJoinScreen.tsx`:

```tsx
import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  listAudioInputs,
  listAudioOutputs,
  openMicStream,
  subscribeMicLevel,
  type DeviceInfo,
} from "../lib/media.js";

export interface PreJoinSelection {
  micDeviceId: string | null;
  speakerDeviceId: string | null;
  publishScreen: boolean;
}

export interface PreJoinScreenProps {
  roomId: string;
  onJoin(selection: PreJoinSelection): void;
  onCancel(): void;
}

export function PreJoinScreen(props: PreJoinScreenProps): ReactElement {
  const [mics, setMics] = useState<DeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<DeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState<string | null>(null);
  const [speakerDeviceId, setSpeakerDeviceId] = useState<string | null>(null);
  const [publishScreen, setPublishScreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState(0);

  const warmStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await openMicStream(undefined);
        stream.getTracks().forEach((t) => t.stop());
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "mic permission denied");
      }
      const [ins, outs] = await Promise.all([listAudioInputs(), listAudioOutputs()]);
      if (cancelled) return;
      setMics(ins);
      setSpeakers(outs);
      setMicDeviceId(ins[0]?.deviceId ?? null);
      setSpeakerDeviceId(outs[0]?.deviceId ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!micDeviceId) {
      setLevel(0);
      return;
    }
    let unsubscribe: (() => void) | null = null;
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await openMicStream(micDeviceId);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        warmStreamRef.current = stream;
        unsubscribe = subscribeMicLevel(stream, (lvl) => {
          if (!cancelled) setLevel(lvl);
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "failed to open mic");
      }
    })();
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      warmStreamRef.current = null;
    };
  }, [micDeviceId]);

  function handleJoin(): void {
    setBusy(true);
    props.onJoin({ micDeviceId, speakerDeviceId, publishScreen });
  }

  return (
    <div className="centered">
      <div className="form" style={{ maxWidth: 480 }}>
        <h2 style={{ margin: 0 }}>Pre-join check</h2>
        <div style={{ color: "var(--text-dim)" }}>Room: {props.roomId}</div>

        <label>
          <div className="section-title">Microphone</div>
          <select
            value={micDeviceId ?? ""}
            onChange={(e) => setMicDeviceId(e.target.value || null)}
          >
            {mics.length === 0 && <option value="">No mic detected</option>}
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>{m.label}</option>
            ))}
          </select>
          <div
            aria-label="mic level"
            style={{
              marginTop: 6,
              height: 6,
              background: "var(--border)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.round(level * 100)}%`,
                height: "100%",
                background: "var(--accent)",
                transition: "width 60ms linear",
              }}
            />
          </div>
        </label>

        <label>
          <div className="section-title">Speakers</div>
          <select
            value={speakerDeviceId ?? ""}
            onChange={(e) => setSpeakerDeviceId(e.target.value || null)}
          >
            {speakers.length === 0 && <option value="">Default output</option>}
            {speakers.map((s) => (
              <option key={s.deviceId} value={s.deviceId}>{s.label}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={publishScreen}
            onChange={(e) => setPublishScreen(e.target.checked)}
          />
          <span>Share a screen (you'll pick the window/monitor on join)</span>
        </label>

        {error && <div className="error">{error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={handleJoin} disabled={busy || mics.length === 0}>
            {busy ? "Joining…" : "Join now"}
          </button>
          <button className="btn secondary" onClick={props.onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @redvoice/client typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/renderer/src/screens/PreJoinScreen.tsx
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): PreJoin screenshare toggle"
```

---

## Task 8: InRoomScreen — connect + leave skeleton

**Files:**
- Create: `apps/client/src/renderer/src/screens/InRoomScreen.tsx`
- Modify: `apps/client/src/renderer/src/screens/LobbyScreen.tsx`

**Context:** InRoomScreen takes `{ roomId, selection, onLeave }` and:
1. On mount: fetches a LiveKit token from the app-server (`api.mintLiveKitToken(roomId)`)
2. Creates a `LiveKitRoom`, calls `join(...)` with the selection
3. Renders a minimal shell with a top bar + Leave button + "connected/connecting/error" status
4. Participant tile grid + audio/screenshare rendering come in Tasks 9-10
5. On unmount or Leave: disconnects

- [ ] **Step 1: Create `InRoomScreen.tsx` minimal**

Write to `apps/client/src/renderer/src/screens/InRoomScreen.tsx`:

```tsx
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactElement } from "react";
import { ApiClient } from "../lib/api.js";
import { useAuthStore } from "../lib/auth-context.js";
import { LiveKitRoom, type RoomStateSnapshot } from "../lib/livekit-room.js";
import { openMicStream } from "../lib/media.js";
import type { PreJoinSelection } from "./PreJoinScreen.js";

export interface InRoomScreenProps {
  roomId: string;
  selection: PreJoinSelection;
  onLeave(): void;
}

interface ConnectionState {
  phase: "connecting" | "connected" | "error";
  message?: string;
}

export function InRoomScreen(props: InRoomScreenProps): ReactElement {
  const token = useAuthStore((s) => s.token);
  const serverUrl = useAuthStore((s) => s.serverUrl);

  const roomWrapper = useMemo(() => new LiveKitRoom(), []);
  const [conn, setConn] = useState<ConnectionState>({ phase: "connecting" });
  const snapshot: RoomStateSnapshot = useSyncExternalStore(
    (cb) => roomWrapper.subscribe(() => cb()),
    () => roomWrapper.snapshot(),
    () => roomWrapper.snapshot(),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const api = new ApiClient(serverUrl);
        api.setToken(token);
        const { token: lkToken, url } = await api.mintLiveKitToken(props.roomId);
        if (cancelled) return;

        const micStream = props.selection.micDeviceId
          ? await openMicStream(props.selection.micDeviceId)
          : undefined;

        await roomWrapper.join({
          wsUrl: url,
          token: lkToken,
          micStream,
          publishScreen: props.selection.publishScreen,
        });
        if (!cancelled) setConn({ phase: "connected" });
      } catch (err) {
        if (cancelled) return;
        setConn({
          phase: "error",
          message: err instanceof Error ? err.message : "failed to connect",
        });
      }
    })();
    return () => {
      cancelled = true;
      void roomWrapper.leave();
    };
  }, [roomWrapper, props.roomId, props.selection, token, serverUrl]);

  async function handleLeave(): Promise<void> {
    await roomWrapper.leave();
    props.onLeave();
  }

  return (
    <div className="app">
      <div className="topbar">
        <strong>RedVoice — In room</strong>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "var(--text-dim)" }}>
            {conn.phase === "connecting" && "Connecting…"}
            {conn.phase === "connected" && `Connected — ${snapshot.remotes.length + 1} participant(s)`}
            {conn.phase === "error" && `Error: ${conn.message}`}
          </span>
          <button className="btn secondary" onClick={() => void handleLeave()}>
            Leave
          </button>
        </div>
      </div>

      <div style={{ padding: 24, flex: 1 }}>
        {conn.phase === "connecting" && <div style={{ color: "var(--text-dim)" }}>Connecting…</div>}
        {conn.phase === "error" && <div className="error">{conn.message}</div>}
        {conn.phase === "connected" && (
          <div style={{ color: "var(--text-dim)" }}>
            Connected. Participant grid arrives in Task 9.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `LobbyScreen.tsx` to use `InRoomScreen` for the inroom phase**

Edit `apps/client/src/renderer/src/screens/LobbyScreen.tsx` — replace the imports at the top and the `phase.kind === "inroom"` branch.

Replace:
```tsx
import { PreJoinScreen, type PreJoinSelection } from "./PreJoinScreen.js";
```
with:
```tsx
import { PreJoinScreen, type PreJoinSelection } from "./PreJoinScreen.js";
import { InRoomScreen } from "./InRoomScreen.js";
```

Replace the entire `if (phase.kind === "inroom")` block (the placeholder) with:

```tsx
  if (phase.kind === "inroom") {
    return (
      <InRoomScreen
        roomId={phase.roomId}
        selection={phase.selection}
        onLeave={() => {
          store.getState().clearActive();
          setPhase({ kind: "lobby" });
        }}
      />
    );
  }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @redvoice/client typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/renderer/src/screens
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): InRoomScreen connects to LiveKit + routes from PreJoin"
```

---

## Task 9: InRoomScreen — participant tile grid + audio rendering

**Files:**
- Modify: `apps/client/src/renderer/src/screens/InRoomScreen.tsx`

**Context:** Now render a tile per participant (local + remote). Each tile shows the display name and has a "talking ring" (border glow when `isSpeaking`). For remote audio, we attach each subscribed audio track to an `<audio>` element injected into the DOM (LiveKit handles autoplay once we've had the user-gesture from "Join now").

- [ ] **Step 1: Replace the entire contents of `InRoomScreen.tsx`**

Write to `apps/client/src/renderer/src/screens/InRoomScreen.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { ApiClient } from "../lib/api.js";
import { useAuthStore } from "../lib/auth-context.js";
import {
  LiveKitRoom,
  RoomEvent,
  Track,
  type LocalParticipant,
  type RemoteParticipant,
  type RoomStateSnapshot,
} from "../lib/livekit-room.js";
import { openMicStream } from "../lib/media.js";
import type { PreJoinSelection } from "./PreJoinScreen.js";

export interface InRoomScreenProps {
  roomId: string;
  selection: PreJoinSelection;
  onLeave(): void;
}

interface ConnectionState {
  phase: "connecting" | "connected" | "error";
  message?: string;
}

function ParticipantTile({
  name,
  isSpeaking,
  isLocal,
}: {
  name: string;
  isSpeaking: boolean;
  isLocal: boolean;
}): ReactElement {
  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: `2px solid ${isSpeaking ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 8,
        padding: 16,
        minHeight: 120,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "border-color 120ms linear",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 600,
        }}
      >
        {name.charAt(0).toUpperCase() || "?"}
      </div>
      <div>
        {name}
        {isLocal && <span style={{ color: "var(--text-dim)" }}> (you)</span>}
      </div>
    </div>
  );
}

export function InRoomScreen(props: InRoomScreenProps): ReactElement {
  const token = useAuthStore((s) => s.token);
  const serverUrl = useAuthStore((s) => s.serverUrl);

  const roomWrapper = useMemo(() => new LiveKitRoom(), []);
  const [conn, setConn] = useState<ConnectionState>({ phase: "connecting" });

  const snapshot: RoomStateSnapshot = useSyncExternalStore(
    (cb) => roomWrapper.subscribe(() => cb()),
    () => roomWrapper.snapshot(),
    () => roomWrapper.snapshot(),
  );

  const audioMountRef = useRef<HTMLDivElement | null>(null);

  // Connect on mount, disconnect on unmount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const api = new ApiClient(serverUrl);
        api.setToken(token);
        const { token: lkToken, url } = await api.mintLiveKitToken(props.roomId);
        if (cancelled) return;

        const micStream = props.selection.micDeviceId
          ? await openMicStream(props.selection.micDeviceId)
          : undefined;

        await roomWrapper.join({
          wsUrl: url,
          token: lkToken,
          micStream,
          publishScreen: props.selection.publishScreen,
        });
        if (!cancelled) setConn({ phase: "connected" });
      } catch (err) {
        if (cancelled) return;
        setConn({
          phase: "error",
          message: err instanceof Error ? err.message : "failed to connect",
        });
      }
    })();
    return () => {
      cancelled = true;
      void roomWrapper.leave();
    };
  }, [roomWrapper, props.roomId, props.selection, token, serverUrl]);

  // Attach remote audio tracks as they come in. LiveKit's Track.attach() creates
  // an <audio> element wired to the track — we insert it into a hidden container
  // that mounts with the screen so autoplay works.
  useEffect(() => {
    const room = roomWrapper.room;
    const mount = audioMountRef.current;
    if (!mount) return;

    const onTrackSubscribed = (track: Track): void => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach() as HTMLAudioElement;
      el.autoplay = true;
      el.playsInline = true;
      mount.appendChild(el);
    };
    const onTrackUnsubscribed = (track: Track): void => {
      if (track.kind !== Track.Kind.Audio) return;
      track.detach().forEach((el) => el.remove());
    };

    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    return () => {
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    };
  }, [roomWrapper]);

  async function handleLeave(): Promise<void> {
    await roomWrapper.leave();
    props.onLeave();
  }

  const participantTiles: Array<{
    id: string;
    name: string;
    isSpeaking: boolean;
    isLocal: boolean;
  }> = [];

  if (snapshot.local) {
    const local: LocalParticipant = snapshot.local;
    participantTiles.push({
      id: local.identity,
      name: local.name || local.identity,
      isSpeaking: local.isSpeaking,
      isLocal: true,
    });
  }
  for (const remote of snapshot.remotes as RemoteParticipant[]) {
    participantTiles.push({
      id: remote.identity,
      name: remote.name || remote.identity,
      isSpeaking: remote.isSpeaking,
      isLocal: false,
    });
  }

  return (
    <div className="app">
      <div className="topbar">
        <strong>RedVoice — In room</strong>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "var(--text-dim)" }}>
            {conn.phase === "connecting" && "Connecting…"}
            {conn.phase === "connected" && `${participantTiles.length} participant(s)`}
            {conn.phase === "error" && `Error: ${conn.message}`}
          </span>
          <button className="btn secondary" onClick={() => void handleLeave()}>
            Leave
          </button>
        </div>
      </div>

      <div style={{ padding: 24, flex: 1, overflow: "auto" }}>
        {conn.phase === "error" && <div className="error">{conn.message}</div>}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          {participantTiles.map((p) => (
            <ParticipantTile key={p.id} name={p.name} isSpeaking={p.isSpeaking} isLocal={p.isLocal} />
          ))}
        </div>
      </div>

      {/* Hidden mount point for <audio> elements created by LiveKit track.attach() */}
      <div ref={audioMountRef} style={{ display: "none" }} aria-hidden="true" />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @redvoice/client typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/renderer/src/screens/InRoomScreen.tsx
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): InRoom participant tile grid + remote audio playback"
```

---

## Task 10: InRoomScreen — screenshare video rendering

**Files:**
- Modify: `apps/client/src/renderer/src/screens/InRoomScreen.tsx`

**Context:** When a participant publishes a screenshare, their tile should show the video instead of the avatar. Local screenshare: render from the `LocalParticipant`'s screenshare publication. Remote screenshare: render from the remote's screenshare track.

- [ ] **Step 1: Replace the entire contents of `InRoomScreen.tsx`**

Write to `apps/client/src/renderer/src/screens/InRoomScreen.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { ApiClient } from "../lib/api.js";
import { useAuthStore } from "../lib/auth-context.js";
import {
  LiveKitRoom,
  RoomEvent,
  Track,
  type LocalParticipant,
  type RemoteParticipant,
  type RoomStateSnapshot,
} from "../lib/livekit-room.js";
import { openMicStream } from "../lib/media.js";
import type { PreJoinSelection } from "./PreJoinScreen.js";

export interface InRoomScreenProps {
  roomId: string;
  selection: PreJoinSelection;
  onLeave(): void;
}

interface ConnectionState {
  phase: "connecting" | "connected" | "error";
  message?: string;
}

interface ParticipantView {
  id: string;
  name: string;
  isSpeaking: boolean;
  isLocal: boolean;
  screenTrack: Track | null;
}

function ParticipantTile({ p }: { p: ParticipantView }): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    const track = p.screenTrack;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [p.screenTrack]);

  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: `2px solid ${p.isSpeaking ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 8,
        padding: p.screenTrack ? 0 : 16,
        minHeight: 180,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "border-color 120ms linear",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {p.screenTrack ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={p.isLocal}
            style={{ width: "100%", height: "100%", objectFit: "contain", background: "black" }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 8,
              left: 8,
              background: "rgba(0,0,0,0.6)",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            {p.name}
            {p.isLocal && <span style={{ color: "var(--text-dim)" }}> (you)</span>}
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
            }}
          >
            {p.name.charAt(0).toUpperCase() || "?"}
          </div>
          <div>
            {p.name}
            {p.isLocal && <span style={{ color: "var(--text-dim)" }}> (you)</span>}
          </div>
        </>
      )}
    </div>
  );
}

function findScreenTrack(p: LocalParticipant | RemoteParticipant): Track | null {
  for (const pub of p.trackPublications.values()) {
    if (pub.source === Track.Source.ScreenShare && pub.track) {
      return pub.track;
    }
  }
  return null;
}

export function InRoomScreen(props: InRoomScreenProps): ReactElement {
  const token = useAuthStore((s) => s.token);
  const serverUrl = useAuthStore((s) => s.serverUrl);

  const roomWrapper = useMemo(() => new LiveKitRoom(), []);
  const [conn, setConn] = useState<ConnectionState>({ phase: "connecting" });

  const snapshot: RoomStateSnapshot = useSyncExternalStore(
    (cb) => roomWrapper.subscribe(() => cb()),
    () => roomWrapper.snapshot(),
    () => roomWrapper.snapshot(),
  );

  const audioMountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const api = new ApiClient(serverUrl);
        api.setToken(token);
        const { token: lkToken, url } = await api.mintLiveKitToken(props.roomId);
        if (cancelled) return;

        const micStream = props.selection.micDeviceId
          ? await openMicStream(props.selection.micDeviceId)
          : undefined;

        await roomWrapper.join({
          wsUrl: url,
          token: lkToken,
          micStream,
          publishScreen: props.selection.publishScreen,
        });
        if (!cancelled) setConn({ phase: "connected" });
      } catch (err) {
        if (cancelled) return;
        setConn({
          phase: "error",
          message: err instanceof Error ? err.message : "failed to connect",
        });
      }
    })();
    return () => {
      cancelled = true;
      void roomWrapper.leave();
    };
  }, [roomWrapper, props.roomId, props.selection, token, serverUrl]);

  useEffect(() => {
    const room = roomWrapper.room;
    const mount = audioMountRef.current;
    if (!mount) return;

    const onTrackSubscribed = (track: Track): void => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach() as HTMLAudioElement;
      el.autoplay = true;
      el.playsInline = true;
      mount.appendChild(el);
    };
    const onTrackUnsubscribed = (track: Track): void => {
      if (track.kind !== Track.Kind.Audio) return;
      track.detach().forEach((el) => el.remove());
    };

    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    return () => {
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    };
  }, [roomWrapper]);

  async function handleLeave(): Promise<void> {
    await roomWrapper.leave();
    props.onLeave();
  }

  const tiles: ParticipantView[] = [];
  if (snapshot.local) {
    tiles.push({
      id: snapshot.local.identity,
      name: snapshot.local.name || snapshot.local.identity,
      isSpeaking: snapshot.local.isSpeaking,
      isLocal: true,
      screenTrack: findScreenTrack(snapshot.local),
    });
  }
  for (const remote of snapshot.remotes as RemoteParticipant[]) {
    tiles.push({
      id: remote.identity,
      name: remote.name || remote.identity,
      isSpeaking: remote.isSpeaking,
      isLocal: false,
      screenTrack: findScreenTrack(remote),
    });
  }

  return (
    <div className="app">
      <div className="topbar">
        <strong>RedVoice — In room</strong>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "var(--text-dim)" }}>
            {conn.phase === "connecting" && "Connecting…"}
            {conn.phase === "connected" && `${tiles.length} participant(s)`}
            {conn.phase === "error" && `Error: ${conn.message}`}
          </span>
          <button className="btn secondary" onClick={() => void handleLeave()}>
            Leave
          </button>
        </div>
      </div>

      <div style={{ padding: 24, flex: 1, overflow: "auto" }}>
        {conn.phase === "error" && <div className="error">{conn.message}</div>}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          {tiles.map((p) => (
            <ParticipantTile key={p.id} p={p} />
          ))}
        </div>
      </div>

      <div ref={audioMountRef} style={{ display: "none" }} aria-hidden="true" />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @redvoice/client typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/renderer/src/screens/InRoomScreen.tsx
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): InRoom renders screenshare tracks in tiles"
```

---

## Task 11: InRoomScreen — control bar (mute + screenshare toggle)

**Files:**
- Modify: `apps/client/src/renderer/src/screens/InRoomScreen.tsx`

**Context:** Add a bottom control bar with three buttons: Mute/Unmute mic, Start/Stop screenshare, Leave. Mute state is derived from LiveKit (`localParticipant.isMicrophoneEnabled`). Screenshare state is derived from whether a screenshare publication exists.

- [ ] **Step 1: Replace the entire contents of `InRoomScreen.tsx`**

Write to `apps/client/src/renderer/src/screens/InRoomScreen.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { ApiClient } from "../lib/api.js";
import { useAuthStore } from "../lib/auth-context.js";
import {
  LiveKitRoom,
  RoomEvent,
  Track,
  type LocalParticipant,
  type RemoteParticipant,
  type RoomStateSnapshot,
} from "../lib/livekit-room.js";
import { openMicStream } from "../lib/media.js";
import type { PreJoinSelection } from "./PreJoinScreen.js";

export interface InRoomScreenProps {
  roomId: string;
  selection: PreJoinSelection;
  onLeave(): void;
}

interface ConnectionState {
  phase: "connecting" | "connected" | "error";
  message?: string;
}

interface ParticipantView {
  id: string;
  name: string;
  isSpeaking: boolean;
  isLocal: boolean;
  screenTrack: Track | null;
}

function ParticipantTile({ p }: { p: ParticipantView }): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    const track = p.screenTrack;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [p.screenTrack]);

  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: `2px solid ${p.isSpeaking ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 8,
        padding: p.screenTrack ? 0 : 16,
        minHeight: 180,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "border-color 120ms linear",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {p.screenTrack ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={p.isLocal}
            style={{ width: "100%", height: "100%", objectFit: "contain", background: "black" }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 8,
              left: 8,
              background: "rgba(0,0,0,0.6)",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            {p.name}
            {p.isLocal && <span style={{ color: "var(--text-dim)" }}> (you)</span>}
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
            }}
          >
            {p.name.charAt(0).toUpperCase() || "?"}
          </div>
          <div>
            {p.name}
            {p.isLocal && <span style={{ color: "var(--text-dim)" }}> (you)</span>}
          </div>
        </>
      )}
    </div>
  );
}

function findScreenTrack(p: LocalParticipant | RemoteParticipant): Track | null {
  for (const pub of p.trackPublications.values()) {
    if (pub.source === Track.Source.ScreenShare && pub.track) {
      return pub.track;
    }
  }
  return null;
}

function hasScreenShare(p: LocalParticipant | null): boolean {
  if (!p) return false;
  for (const pub of p.trackPublications.values()) {
    if (pub.source === Track.Source.ScreenShare) return true;
  }
  return false;
}

export function InRoomScreen(props: InRoomScreenProps): ReactElement {
  const token = useAuthStore((s) => s.token);
  const serverUrl = useAuthStore((s) => s.serverUrl);

  const roomWrapper = useMemo(() => new LiveKitRoom(), []);
  const [conn, setConn] = useState<ConnectionState>({ phase: "connecting" });

  const snapshot: RoomStateSnapshot = useSyncExternalStore(
    (cb) => roomWrapper.subscribe(() => cb()),
    () => roomWrapper.snapshot(),
    () => roomWrapper.snapshot(),
  );

  const audioMountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const api = new ApiClient(serverUrl);
        api.setToken(token);
        const { token: lkToken, url } = await api.mintLiveKitToken(props.roomId);
        if (cancelled) return;

        const micStream = props.selection.micDeviceId
          ? await openMicStream(props.selection.micDeviceId)
          : undefined;

        await roomWrapper.join({
          wsUrl: url,
          token: lkToken,
          micStream,
          publishScreen: props.selection.publishScreen,
        });
        if (!cancelled) setConn({ phase: "connected" });
      } catch (err) {
        if (cancelled) return;
        setConn({
          phase: "error",
          message: err instanceof Error ? err.message : "failed to connect",
        });
      }
    })();
    return () => {
      cancelled = true;
      void roomWrapper.leave();
    };
  }, [roomWrapper, props.roomId, props.selection, token, serverUrl]);

  useEffect(() => {
    const room = roomWrapper.room;
    const mount = audioMountRef.current;
    if (!mount) return;

    const onTrackSubscribed = (track: Track): void => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach() as HTMLAudioElement;
      el.autoplay = true;
      el.playsInline = true;
      mount.appendChild(el);
    };
    const onTrackUnsubscribed = (track: Track): void => {
      if (track.kind !== Track.Kind.Audio) return;
      track.detach().forEach((el) => el.remove());
    };

    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    return () => {
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    };
  }, [roomWrapper]);

  async function handleLeave(): Promise<void> {
    await roomWrapper.leave();
    props.onLeave();
  }

  async function handleToggleMute(): Promise<void> {
    const currentlyMuted = !(snapshot.local?.isMicrophoneEnabled ?? true);
    await roomWrapper.setMuted(!currentlyMuted);
  }

  async function handleToggleScreen(): Promise<void> {
    const sharing = hasScreenShare(snapshot.local);
    await roomWrapper.setScreenShare(!sharing);
  }

  const tiles: ParticipantView[] = [];
  if (snapshot.local) {
    tiles.push({
      id: snapshot.local.identity,
      name: snapshot.local.name || snapshot.local.identity,
      isSpeaking: snapshot.local.isSpeaking,
      isLocal: true,
      screenTrack: findScreenTrack(snapshot.local),
    });
  }
  for (const remote of snapshot.remotes as RemoteParticipant[]) {
    tiles.push({
      id: remote.identity,
      name: remote.name || remote.identity,
      isSpeaking: remote.isSpeaking,
      isLocal: false,
      screenTrack: findScreenTrack(remote),
    });
  }

  const muted = !(snapshot.local?.isMicrophoneEnabled ?? true);
  const sharing = hasScreenShare(snapshot.local);

  return (
    <div className="app">
      <div className="topbar">
        <strong>RedVoice — In room</strong>
        <span style={{ color: "var(--text-dim)" }}>
          {conn.phase === "connecting" && "Connecting…"}
          {conn.phase === "connected" && `${tiles.length} participant(s)`}
          {conn.phase === "error" && `Error: ${conn.message}`}
        </span>
      </div>

      <div style={{ padding: 24, flex: 1, overflow: "auto" }}>
        {conn.phase === "error" && <div className="error">{conn.message}</div>}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          {tiles.map((p) => (
            <ParticipantTile key={p.id} p={p} />
          ))}
        </div>
      </div>

      <div
        style={{
          borderTop: "1px solid var(--border)",
          background: "var(--bg-elev)",
          padding: 12,
          display: "flex",
          gap: 8,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <button
          className={`btn ${muted ? "" : "secondary"}`}
          onClick={() => void handleToggleMute()}
          disabled={conn.phase !== "connected"}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <button
          className={`btn ${sharing ? "" : "secondary"}`}
          onClick={() => void handleToggleScreen()}
          disabled={conn.phase !== "connected"}
        >
          {sharing ? "Stop sharing" : "Share screen"}
        </button>
        <button className="btn secondary" onClick={() => void handleLeave()}>
          Leave
        </button>
      </div>

      <div ref={audioMountRef} style={{ display: "none" }} aria-hidden="true" />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @redvoice/client typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/renderer/src/screens/InRoomScreen.tsx
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): InRoom control bar — mute, share, leave"
```

---

## Task 12: README update + manual smoke-test notes

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace root `README.md`**

Write to `/var/home/red/Projects/RedVoice/README.md`:

```markdown
# RedVoice

Open-source, self-hostable, Discord-style screenshare + voice chat.

**Status:** Plan 3 shipped — media integration working end-to-end (audio + screenshare via LiveKit). Plan 4 next: deployment polish + distinctive UI + installers.

## Repo Layout (monorepo, pnpm)

- `apps/server` — Node/Fastify HTTP API (accounts, rooms, LiveKit token minting)
- `apps/client` — Electron + React desktop client (Windows + Linux)
- `packages/shared` — TypeScript types shared across client + server
- `infra/` — Docker Compose for the LiveKit media server
- `docs/superpowers/specs/` — design specs
- `docs/superpowers/plans/` — implementation plans

## Local development (three terminals)

```bash
# Prerequisites: Node ≥20, pnpm ≥9, Docker + Docker Compose

pnpm install

# Terminal 1: LiveKit media server
cd infra && docker compose up

# One-time DB init (if you haven't)
cd apps/server && pnpm prisma migrate dev
cd ../..

# Terminal 2: app-server
pnpm server:dev

# Terminal 3: Electron client
pnpm --filter @redvoice/client dev
```

## Try it with two users

Launch the client twice (each run opens its own window). Register two separate accounts, have both join the same room, talk into your mic — you should hear yourself in the other window.

Screenshare: tick "Share a screen" in the pre-join check, click "Join now", pick a window or monitor in the OS prompt.

## Environment variables (server)

| Var | Description | Example |
|---|---|---|
| `DATABASE_URL` | Prisma SQLite URL | `file:./dev.db` |
| `JWT_SECRET` | ≥32-char secret for session JWTs | random 32+ bytes |
| `LIVEKIT_URL` | WebSocket URL of the LiveKit server | `ws://localhost:7880` |
| `LIVEKIT_API_KEY` | LiveKit API key (matches `infra/livekit.yaml`) | `devkey-redvoice` |
| `LIVEKIT_API_SECRET` | ≥32-char LiveKit API secret | `devsecret-redvoice-devsecret-redvoice-32` |
| `PORT` | HTTP port (optional) | `3000` |
| `HOST` | Bind address (optional) | `0.0.0.0` |

## HTTP API

All non-auth endpoints require `Authorization: Bearer <jwt>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create account, return session JWT |
| POST | `/auth/login` | Password login, return session JWT |
| POST | `/auth/logout` | Revoke current session |
| GET  | `/me` | Current user |
| GET  | `/rooms` | Your owned + recent rooms |
| POST | `/rooms` | Create room |
| GET  | `/rooms/:id` | Room metadata |
| POST | `/rooms/:id/token` | LiveKit access token for this room |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "docs: README covers media integration (Plan 3)"
```

---

## Done — Plan 3 acceptance checklist

Automated checks (run from the repo root):

- [ ] `pnpm -r typecheck` green
- [ ] `pnpm -r test` green (44 server + 16 client = 60 total)
- [ ] `docker compose -f infra/docker-compose.yml config` parses without error

Manual smoke test:

- [ ] `docker compose up` in `infra/` leaves LiveKit listening on `ws://localhost:7880`
- [ ] `curl http://localhost:7880` returns `OK`
- [ ] `pnpm server:dev` starts cleanly after updating `.env` to the new LiveKit secret
- [ ] Electron client launches and goes through Login → Lobby (Plan 2 flows still work)
- [ ] Click a room → **Pre-Join Check** appears with the mic VU meter animating when you speak
- [ ] Click "Join now" → **In-Room** screen appears; your own tile shows your display name
- [ ] Launch a SECOND copy of the Electron client in another user's account, join the same room
  - **Second participant's tile appears in the grid**
  - **Speaking into either mic shows the ring highlight on the correct tile**
  - **Audio flows both ways** (confirmed by talking)
- [ ] Tick "Share a screen" in pre-join of one client, pick a window on Join → other client's tile for that user shows the shared video
- [ ] Mute button toggles mic, other client stops receiving audio
- [ ] Leave button returns to Lobby cleanly
- [ ] Close the window mid-call → other client's roster drops you within ~5 seconds

Once all boxes are checked, Plan 3 is done and you're ready for Plan 4 (deployment + polish + first GitHub release).
