# RedVoice

Open-source, self-hostable, Discord-style screenshare + voice chat.

**Status:** Plan 1 (app-server core) in progress.

## Repo Layout (monorepo, pnpm)

- `apps/server` — Node/Fastify HTTP API (accounts, rooms, LiveKit token minting)
- `packages/shared` — TypeScript types shared across client + server
- `docs/superpowers/specs/` — design specs
- `docs/superpowers/plans/` — implementation plans

Future: `apps/client` (Electron), `infra/` (Docker Compose).

## Local development (app-server)

```bash
# Prerequisites: Node ≥20, pnpm ≥9
pnpm install

# First time: init the SQLite DB
cd apps/server && pnpm prisma migrate dev
cd ../..

# Create apps/server/.env — see apps/server/.env.example

# Run the server (auto-reload)
pnpm server:dev

# Run the tests
pnpm server:test
```

## Environment variables

The server refuses to start without these (validated at boot):

| Var | Description | Example |
|---|---|---|
| `DATABASE_URL` | Prisma SQLite URL | `file:./dev.db` |
| `JWT_SECRET` | ≥32-char secret for session JWTs | random 32+ bytes |
| `LIVEKIT_URL` | Public WebSocket URL of your LiveKit server | `wss://media.example.com` |
| `LIVEKIT_API_KEY` | LiveKit API key | `APIxxxxxxxx` |
| `LIVEKIT_API_SECRET` | ≥32-char LiveKit API secret | random 32+ bytes |
| `PORT` | HTTP port (optional) | `3000` |
| `HOST` | Bind address (optional) | `0.0.0.0` |

## API

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
