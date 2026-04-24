# RedVoice — Design Spec

- **Status**: Approved for planning
- **Date**: 2026-04-24
- **Owner**: R3dWolfie
- **Repo**: `/var/home/red/Projects/RedVoice`
- **Deployment target**: `voice.R3dWolfie.com` (self-host on R3dWolfie's Fedora box, behind Cloudflare tunnel)

## Goal

An open-source, self-hostable, Discord-style screenshare + voice chat application. Users register an account, create persistent named rooms, share them via link, and join to screenshare with system audio while talking over mic. Target group size: up to ~10 people per room.

## Non-Goals (MVP)

Explicitly out of scope for the initial Bare MVP. These may be added later but must not be designed-in now:

- Text chat, DMs, or any messaging
- Friend lists, user profiles beyond a display name
- Multiple rooms per "server/guild" — rooms are flat top-level entities
- Roles, permissions, room-level moderation (kick/ban/mute-others)
- Webcam video
- Emoji reactions, voice effects
- Mobile clients
- Email verification, password reset flows
- Load testing or scaling beyond a single server
- In-app payments / monetization

## Product Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Use case | Watch-together screenshare + voice, like Discord voice channels | User-specified |
| Group size | Up to ~10 per room | Requires an SFU; rules out P2P mesh |
| Audio model | Sharer's system audio + every participant's mic | Full Discord voice-channel experience |
| Room model | Full accounts + persistent rooms (owners can create, anyone with link can join) | User-specified — scoped down from full Discord clone |
| Client platform | Electron, Windows + Linux installers | Pragmatic: Chromium gives us battle-tested WebRTC for free. Native (Qt/Rust) would add 6+ months for libwebrtc integration. |
| App-server language | Node.js + TypeScript | One language across client + server; shared types over `packages/shared`. User has no Node experience but has strong Python background — TS + Fastify + Prisma is the gentlest Node entry point. |
| Media server | LiveKit (self-hosted, single Go binary via Docker) | Most "it just works" open-source SFU for self-hosters. Screenshare is a first-class track. Excellent TS SDK. Built-in JWT auth. |
| DB | SQLite via Prisma | Zero-config for self-host. Swap to Postgres later by changing the connection string. |
| Session auth | Email + password → stateless JWT with server-side revocation table | Keeps the MVP small (no email infra) while retaining revoke-on-logout |
| UI direction | Discord-inspired dark theme, implemented via `frontend-design` skill | Not a pixel clone (copyright risk + feature set mismatch). Aesthetic only. |

## MVP Feature Set (the Bare MVP)

1. Register with email + password + display name
2. Log in, stay logged in (JWT stored in Electron `safeStorage`)
3. Create a room (owner = creator)
4. See "My Rooms" and "Recent Rooms" on a home screen
5. Join a room by pasting a room link (`voice.R3dWolfie.com/join/<room-id>`) into the app's "Join by link" field, or by clicking one from the home list. (OS-level deep-link handling — clicking the URL in a browser and having it open the app — is explicitly deferred to post-MVP. The URL format is forward-compatible with adding a handler later.)
6. Pre-join check before entering the room: confirm mic device, speaker device, screenshare source (or "no share"). Live mic-level meter shown so the user sees their mic is working. "Join now" button to proceed; "Cancel" returns to home. This is a hard requirement — skipping it is the top cause of "why can't anyone hear me?" support issues in voice apps.
7. Inside a room:
   - Pick a screen/window to share (or none), via LiveKit's `getDisplayMedia`
   - Mic is always on by default using voice-activity detection
   - Toggle to push-to-talk mode, with a configurable global hotkey
   - Mute/unmute mic
   - Stop/start screenshare
   - See a grid of participant tiles: own tile on top-left, each tile shows that user's screenshare or avatar, a ring around the tile pulses when they're talking
   - Leave button
8. Settings modal: mic/speaker device pickers, mic-mode toggle, PTT hotkey capture, preferred screencap resolution, log out

## Architecture

```
┌──────────────────────────┐          ┌───────────────────────────┐
│  Electron Client         │          │  R3dWolfie's Fedora box   │
│  (Win + Linux installers)│          │                           │
│                          │  HTTPS   │  ┌─────────────────────┐  │
│  React + TS              │◀────────▶│  │ app-server (Node)   │  │
│  LiveKit JS SDK          │ (signal) │  │ Fastify + Prisma    │  │
│                          │          │  │ SQLite              │  │
│                          │          │  └──────────┬──────────┘  │
│                          │          │             │ mints       │
│                          │          │             │ LiveKit JWT │
│                          │          │             ▼             │
│                          │  WSS/UDP │  ┌─────────────────────┐  │
│                          │◀────────▶│  │ livekit-server      │  │
│                          │ (media)  │  │ (Go)                │  │
│                          │          │  └─────────────────────┘  │
└──────────────────────────┘          └───────────────────────────┘
                                      HTTPS via Cloudflare tunnel;
                                      UDP via direct port-forward
```

### Components

1. **Electron client** (`apps/client`) — the app users install. React + TypeScript. Uses LiveKit JS SDK for all real-time media. Talks to app-server over HTTPS for everything non-realtime (register, login, list rooms, fetch access tokens). Stores session JWT in Electron `safeStorage` (OS keychain-backed).

2. **app-server** (`apps/server`) — Node.js + TypeScript + Fastify + Prisma. The brain. Handles all user and room state. Issues two kinds of tokens: session JWTs (for itself) and LiveKit access tokens (for the media server). Never proxies media.

3. **livekit-server** — run as a container from the official LiveKit Docker image. Stateless. Validates LiveKit access tokens using a shared API secret. Forwards audio and screenshare tracks between peers.

4. **Shared types** (`packages/shared`) — TypeScript types (room shapes, API request/response DTOs) imported by both client and server.

Monorepo layout: `pnpm` workspaces.

### Data Model (Prisma, SQLite)

```
User
  id            uuid      @id
  email         string    @unique
  displayName   string
  passwordHash  string    // argon2id
  createdAt     datetime

Session                              // JWTs are stateless, but we keep a revocation table
  id         uuid     @id
  userId     uuid     → User
  createdAt  datetime
  revokedAt  datetime?

Room
  id         uuid     @id
  name       string
  ownerId    uuid     → User
  createdAt  datetime

RoomMembership                       // populated on first join; powers "Recent Rooms"
  userId      uuid → User
  roomId      uuid → Room
  lastJoined  datetime               // updated every time the user fetches a LiveKit token for this room
  @@id([userId, roomId])
```

Four tables. No messages, no friends, no room-permission table. Live presence (who is currently connected, who is talking, who is sharing) is NOT in the DB — it lives in livekit-server's memory. Server restarts drop presence; rooms persist.

### Auth & Token Flow

Two distinct tokens. Do not confuse them:

**Session JWT** (signed by app-server with `JWT_SECRET`)
- Issued on register/login
- Stored client-side in Electron `safeStorage` (OS keychain — Linux Secret Service / Windows DPAPI)
- Sent as `Authorization: Bearer <jwt>` on every app-server API call
- Payload: `{ userId, sessionId, exp: now + 30 days }`
- Revocation: on each request, check `Session.revokedAt IS NULL` by `sessionId`. Cheap lookup.

**LiveKit access token** (signed by app-server with `LIVEKIT_API_SECRET`, shared with livekit-server)
- Minted when client hits `POST /rooms/:id/token` with a valid session JWT
- App-server verifies session JWT, verifies/creates `RoomMembership`, then signs a LiveKit JWT
- Payload: `{ room: <roomId>, identity: <userId>, name: <displayName>, canPublish: true, canSubscribe: true, exp: now + 1 hour }`
- Handed to the LiveKit JS SDK client-side; livekit-server validates with the same shared secret

**Password handling**
- argon2id via `@node-rs/argon2` with library defaults
- Minimum 12 characters, no character-class rules
- Register endpoint rate-limited to 5/hour/IP

**Password reset & email verification**
- NOT in MVP (no email infrastructure). Lost password = manual DB intervention for now.
- Post-MVP: a web frontend at `voice.R3dWolfie.com` will host account management (password reset, email verification). Electron client will deep-link to these flows once they exist.

### HTTP API (app-server)

All JSON. All non-auth endpoints require `Authorization: Bearer <session-jwt>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create user, return session JWT |
| POST | `/auth/login` | Verify password, return session JWT |
| POST | `/auth/logout` | Revoke current session (sets `revokedAt`) |
| GET  | `/me` | Return current user's profile |
| GET  | `/rooms` | List rooms the user owns + recent rooms joined |
| POST | `/rooms` | Create a room |
| GET  | `/rooms/:id` | Get a room's metadata (name, owner, whether current user has joined before) |
| POST | `/rooms/:id/token` | Mint a LiveKit access token for this user + room |

No delete-room in MVP. No update-room in MVP.

### Client Screens

1. **Login / Register** — toggle between modes. Fields: server URL (defaults to `voice.R3dWolfie.com`, editable for self-hosters), email, password, display name (register only).
2. **Home / Lobby** — two-column: left is "My Rooms" + "Recent Rooms" list, right is a big "Create Room" button and a "Join by link" input.
3. **Pre-Join Check** — after clicking join on a room, before entering it. Shows: mic device picker with live VU-meter, speaker device picker with a "test sound" button, screenshare source picker (screen / window / none) with a small preview thumbnail. "Join now" proceeds; "Cancel" returns to Lobby. This screen is required in MVP — it prevents the most common voice-app UX failure ("nobody can hear me").
4. **In-Room** — grid of participant tiles; bottom control bar with mute / share / mic-mode / leave.
5. **Settings** — modal. Mic device, speaker device, mic mode (VAD / PTT), PTT hotkey capture, preferred screencap resolution, log out button.

Implementation will invoke the `frontend-design` skill to produce a distinctive, Discord-inspired dark theme rather than a generic AI-default aesthetic.

### Mic Mode Details

- Default: **voice-activity** — mic stays on; LiveKit's built-in VAD gates it so silence isn't transmitted.
- Optional: **push-to-talk** — mic is muted until the configured hotkey is held.
- Hotkey is global (works when app is not focused) via Electron `globalShortcut`. User captures it in settings by pressing a key combo.

### Deployment

Single machine, Docker Compose:

```yaml
services:
  app-server:   # internal only, port 3000
  livekit:      # 7880 signaling (WSS), 7881 media (UDP), 7882 media (TCP fallback)
  caddy:        # reverse proxy, TLS, routes voice.R3dWolfie.com
```

**Traffic routing:**

| Traffic | Path | Transport |
|---|---|---|
| App API | Cloudflare tunnel → Caddy → app-server:3000 | HTTPS |
| LiveKit signaling | Cloudflare tunnel → Caddy → livekit:7880 | WSS |
| LiveKit media (primary) | **Direct UDP port-forward** on router → livekit:7881 | UDP/SRTP |
| LiveKit media (fallback) | Cloudflare tunnel → Caddy → livekit:7882 | TCP |

**Why the UDP split:** Cloudflare tunnels don't proxy UDP reliably. Media needs UDP for low latency. The deployment instructions tell self-hosters to open UDP 7881 on their router and point a DNS A record at their home IP for media only. If they can't, the TCP fallback works but with higher jitter.

**Config:** three required env vars — `DOMAIN`, `LIVEKIT_API_SECRET`, `JWT_SECRET`. Cloudflare tunnel setup documented in `README.md`.

**Persistence:** SQLite DB on a named Docker volume. Backup = `cp voice.db voice.db.bak`.

**Observability (deferred):** LiveKit exposes Prometheus metrics but we don't scrape them in MVP. Log level defaults to `warn`.

### Error Handling

- **App-server**: typed errors (`ValidationError`, `AuthError`, `NotFoundError`, `ConflictError`) → mapped to HTTP status codes in a single error-handling Fastify hook. Never leak stack traces to clients.
- **Client network failures**: every API call wrapped; user-facing toast on failure; retry only for safe/idempotent calls (GETs) with exponential backoff.
- **LiveKit connection failures**: the LiveKit SDK handles reconnection. Client shows a "Reconnecting…" banner when the SDK fires its `Reconnecting` event. If reconnect fails after 30s, kick user back to the lobby with an error toast.
- **Token expiry mid-call**: LiveKit tokens are 1 hour; before expiry, client pre-emptively hits `/rooms/:id/token` again for a fresh token and updates the SDK. If that fails, user gets a "Session expired, rejoin?" prompt.

### Testing

**App-server**
- Unit tests (Vitest): auth logic, JWT signing/verify, LiveKit token minting helpers, Prisma query helpers
- Integration tests (Vitest + Fastify `inject`): every HTTP endpoint against a throwaway SQLite DB and a fake `LIVEKIT_API_SECRET`
- Target ~80% line coverage on `apps/server`

**Client**
- Unit tests (Vitest) on pure logic only: auth store, settings reducer, PTT state machine
- No Playwright/Electron end-to-end in MVP — too slow to justify
- Manual smoke-test checklist before each release: register, login, create room, join, share screen, hear audio, PTT works, log out

**Not tested by us**
- LiveKit's media pipeline — trusted
- WebRTC under adverse network conditions — manual only for MVP

**CI**
- GitHub Actions: lint + typecheck + tests on every PR
- On tagged release: build Windows `.exe` installer and Linux AppImage, attach to GitHub release

## Open Risks

1. **UDP port-forward requirement** — if a self-hoster can't open UDP, quality degrades. Mitigated by TCP fallback.
2. **Linux system-audio capture** — Wayland/PipeWire `getDisplayMedia` audio support is evolving; may require a PipeWire portal config fallback. To be validated early in implementation.
3. **No Node experience on the team** — risk of slower initial ramp. Mitigated by sticking to boring, well-documented tools (Fastify, Prisma, Vitest).
4. **Cloudflare tunnel + WSS** — works in practice but worth verifying LiveKit signaling throughput doesn't hit tunnel limits during first deploy.

## Post-MVP Roadmap (not locked, just flagged)

In likely order of usefulness, to be re-prioritized once MVP is in real hands:

1. Web frontend at `voice.R3dWolfie.com` for account management, incl. password reset and email verification
2. Text chat per room
3. Room owner controls: kick user, mute user, delete room, rename room
4. Password-protected rooms
5. Room "join links with expiry"
6. Webcam video tracks
7. macOS client build
8. Notifications when someone joins a room you own
