# Self-hosting RedVoice

Run your own instance — your accounts, your rooms, your data.

## What you get

- A Fastify auth/rooms server reachable at a domain you control (e.g. `voice.example.com`)
- A LiveKit media server running locally for voice + screenshare
- A SQLite database holding accounts, sessions, rooms, memberships
- An `electron-updater`-compatible release channel of the desktop client (optional)

You **must** trust users you give accounts to — you are the sole operator and the bandwidth payer for any voice/screen traffic. With the invite-only flow planned in P5 T19 + T20, you stay in control of who can register.

## Prerequisites

- A Linux box (or any always-on machine) with at least 2 GB RAM
- Node.js 22+
- pnpm 9+ (`npm i -g pnpm`)
- Docker + Docker Compose (for LiveKit)
- A Cloudflare account with a domain pointed at it (for the tunnel — optional but recommended)
- Git

## Step 1 — Clone and install

```bash
git clone https://github.com/R3dWolfie/RedVoice.git
cd RedVoice
pnpm install
```

## Step 2 — LiveKit (media server)

```bash
cd infra
docker compose up -d
```

LiveKit listens on:
- `ws://localhost:7880` — signaling
- `UDP 50000-50020` — media
- `TCP 7881` — fallback

For production, generate fresh keys in `infra/livekit.yaml` (replace the `devkey-redvoice` / `devsecret-redvoice-...` defaults). Use long random secrets — `openssl rand -base64 48`.

## Step 3 — Server config

Copy the template:

```bash
cp apps/server/.env.example apps/server/.env
```

Edit `apps/server/.env`:

```env
DATABASE_URL="file:./dev.db"
# 32+ random chars. Generate: openssl rand -base64 32
JWT_SECRET="<long-random-string>"

# Match infra/livekit.yaml exactly
LIVEKIT_URL="ws://localhost:7880"
LIVEKIT_API_KEY="<your-key>"
LIVEKIT_API_SECRET="<your-secret-32+chars>"

# Listen address. 127.0.0.1 if behind a tunnel; 0.0.0.0 if direct.
HOST="127.0.0.1"
PORT="3000"
NODE_ENV="production"
```

Apply migrations + build:

```bash
cd apps/server
pnpm prisma migrate deploy
pnpm build
```

## Step 4 — Run the server

### Option A: systemd unit (recommended)

A unit template ships at `apps/server/deploy/redvoice-server.service`. Install it as a user service so you don't need root:

```bash
mkdir -p ~/.config/systemd/user
cp apps/server/deploy/redvoice-server.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now redvoice-server.service
```

Verify:

```bash
systemctl --user status redvoice-server.service
journalctl --user -u redvoice-server -f
```

To survive logout / persist across reboots without you logged in:

```bash
sudo loginctl enable-linger $USER
```

### Option B: ad-hoc

```bash
cd apps/server
pnpm start
```

Test locally:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

## Step 5 — Public reachability via Cloudflare Tunnel

(If you only want a LAN-only instance, skip this — point clients at `http://<your-lan-ip>:3000`.)

Install `cloudflared` and authenticate:

```bash
cloudflared tunnel login
```

Create a tunnel:

```bash
cloudflared tunnel create redvoice
```

Copy the credentials path it prints (`~/.cloudflared/<uuid>.json`).

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <uuid>
credentials-file: /home/<you>/.cloudflared/<uuid>.json

ingress:
  - hostname: voice.example.com
    service: http://localhost:3000
  - service: http_status:404
```

Route DNS + start as a user systemd service:

```bash
cloudflared tunnel route dns redvoice voice.example.com

# Service install (one-time)
sudo cloudflared service install
# OR run as user:
cloudflared --config ~/.cloudflared/config.yml tunnel run redvoice
```

Verify externally:

```bash
curl https://voice.example.com/health
```

### LiveKit reachability

Cloudflare Tunnel handles HTTP fine but **not** LiveKit's UDP media. Two paths:

1. **TURN fallback only.** Run a coturn TURN server on a port Cloudflare can proxy (TCP/443). Higher latency but no router config.
2. **Direct LiveKit.** Add a second DNS record (`livekit.example.com`) NOT proxied through Cloudflare, pointing at your home IP. Forward UDP 50000-50020 + TCP 7881 on your router. Lowest latency, exposes your IP.

For most home users, option 1 is simpler. Option 2 is required if friends are on locked-down networks where TCP/443 isn't enough.

## Step 6 — Point the client at your server

In RedVoice, on the Login screen, change the **Server** field to `https://voice.example.com`. Register a fresh account (your existing local account doesn't migrate).

## Updating

The client auto-updates from GitHub Releases. Server updates:

```bash
cd RedVoice
git pull
pnpm install
cd apps/server
pnpm prisma migrate deploy
pnpm build
systemctl --user restart redvoice-server.service
```

## Backup

The entire account store is `apps/server/prisma/dev.db`. Backup is one file:

```bash
sqlite3 apps/server/prisma/dev.db ".backup /path/to/redvoice-$(date +%F).db"
```

Restoring is `cp` over the running file (stop the service first).

## Troubleshooting

- **"Failed to fetch" on register:** Server isn't reachable. Check `curl https://voice.example.com/health` from outside your network.
- **"Connection refused" in client logs:** Tunnel is up but server is down. Check `journalctl --user -u redvoice-server`.
- **Calls connect but no audio:** LiveKit UDP is blocked. Either configure TURN, or open UDP 50000-50020.
- **"JWT_SECRET must be at least 32 chars":** Your secret is too short. Regenerate with `openssl rand -base64 32`.
- **Prisma migration errors:** Database file may be from an older schema. Backup, then `pnpm prisma migrate deploy`.

## Security notes

- The `.env` file contains LiveKit + JWT secrets. Never commit it. Permissions should be `chmod 600`.
- argon2id is used for password hashing — strong, but you should still encourage long passwords.
- The server has no admin UI yet; users are managed via direct SQLite queries.
- Rate limiting is enabled on `/auth/*` endpoints (`@fastify/rate-limit`). Tune in `apps/server/src/app.ts` if you get false positives.
- TLS is handled by Cloudflare's edge; the Fastify server itself listens on plain HTTP behind the tunnel.

## License

AGPL-3.0. If you modify and run a public instance, you must offer the source.
