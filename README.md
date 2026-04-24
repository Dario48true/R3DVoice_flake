# RedVoice

Open-source, self-hostable, Discord-style screenshare + voice chat.

**Status:** Plan 2 shipped — app-server + Electron client with auth/lobby. Next: Plan 3 (LiveKit infra + in-room experience).

## Repo Layout (monorepo, pnpm)

- `apps/server` — Node/Fastify HTTP API (accounts, rooms, LiveKit token minting)
- `apps/client` — Electron + React desktop client (Windows + Linux)
- `packages/shared` — TypeScript types shared across client + server
- `docs/superpowers/specs/` — design specs
- `docs/superpowers/plans/` — implementation plans

Future: `infra/` (Docker Compose for LiveKit + Caddy).

## Local development

```bash
# Prerequisites: Node ≥20, pnpm ≥9
pnpm install

# First time: init the SQLite DB
cd apps/server && pnpm prisma migrate dev
cd ../..

# Create apps/server/.env — see apps/server/.env.example

# Terminal 1: run the app-server
pnpm server:dev

# Terminal 2: run the Electron client
pnpm --filter @redvoice/client dev

# Run all tests
pnpm test
```

## Environment variables (server)

| Var | Description | Example |
|---|---|---|
| `DATABASE_URL` | Prisma SQLite URL | `file:./dev.db` |
| `JWT_SECRET` | ≥32-char secret for session JWTs | random 32+ bytes |
| `LIVEKIT_URL` | Public WebSocket URL of your LiveKit server | `wss://media.example.com` |
| `LIVEKIT_API_KEY` | LiveKit API key | `APIxxxxxxxx` |
| `LIVEKIT_API_SECRET` | ≥32-char LiveKit API secret | random 32+ bytes |
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
