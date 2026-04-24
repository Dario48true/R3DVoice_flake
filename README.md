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

## Cross-OS notes

| OS | Screenshare | System audio | Notes |
|---|---|---|---|
| **Windows** | Works | Works (`loopback`) | No extra setup |
| **Linux (XWayland)** | Works | Works via PipeWire portal | Enable "Compatibility mode" in Settings if on native Wayland and screenshare is glitchy |
| **Linux (Wayland native)** | Works (picker UX varies by compositor) | Requires `xdg-desktop-portal` ≥ 1.14 | |
| **macOS** | Works | Limited (needs permission) | Grant Screen Recording permission in System Settings → Privacy & Security |

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
