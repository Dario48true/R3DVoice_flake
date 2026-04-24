# RedVoice Plan 7 — Web Client (voice.R3dWolfie.com) Implementation Plan

> **Status:** STUB — scope sketch only. Full task breakdown pending after Plan 5 ships.

**Goal:** A browser-based version of RedVoice at `voice.r3dwolfie.com` (and any self-hoster's domain). Visitors can register, log in, and join rooms entirely in their browser — no Electron install required. Shares ~80% of the existing renderer code; the 20% that differs replaces Electron APIs with browser equivalents.

**Timeline:** 1–2 weeks of work. Should not start until Plan 5 is fully shipped and voice is stable.

---

## What's the same vs. different

### Reused as-is
- All of `packages/shared` (DTOs)
- `apps/client/src/renderer/src/lib/api.ts` (fetch works in browsers)
- `apps/client/src/renderer/src/lib/auth-store.ts` (Zustand doesn't care about runtime)
- `apps/client/src/renderer/src/lib/rooms-store.ts`
- `apps/client/src/renderer/src/lib/livekit-room.ts` (LiveKit SDK is browser-native)
- `apps/client/src/renderer/src/lib/media.ts` (all Web APIs)
- All of `apps/client/src/renderer/src/screens/*.tsx` (pure React)
- All of `apps/client/src/renderer/src/components/*.tsx`

### Replaced (Electron → browser)
| Electron | Browser equivalent |
|---|---|
| `window.redvoice.saveToken()` (safeStorage) | `document.cookie` with `HttpOnly; Secure; SameSite=Lax` — server sets cookie |
| `window.redvoice.listScreenSources()` + picker dialog | `getDisplayMedia()` — Chrome/Firefox built-in picker |
| `globalShortcut` (PTT) | Disabled on web (must be focused) or use `keydown` listener only |
| `setDisplayMediaRequestHandler` in main | Not needed — browser handles it |
| `app.setAsDefaultProtocolClient` (deep links) | Register via Web Share Target API (Chrome) or a server-side redirect |

### New
- Node server now serves static files at `/web/*` (or a separate subdomain)
- Cookie-based auth (not Bearer tokens)
- HTTPS mandatory (getDisplayMedia requires it)
- CSP tightened for production

---

## Architecture decision: shared app or fork?

**Option A: Shared codebase, runtime detection.**
- One `apps/client` that builds two outputs: Electron main + renderer, AND a web bundle
- Renderer code checks `typeof window.redvoice === "undefined"` to detect browser, falls back
- **Pro:** One screen component to maintain
- **Con:** Code bloat (Electron-specific paths shipped to web + vice versa); CSP has to accommodate both

**Option B: New package `apps/web` that imports from `apps/client/src/renderer`.**
- `apps/web` has its own Vite config, targets web only
- Imports screens + lib from `apps/client/src/renderer/src`
- Provides its own adapter for the `window.redvoice` shape (via cookie-based alternatives)
- **Pro:** Clean separation; each build ships only what it needs
- **Con:** A third package to coordinate (`shared` + `client` + `web`)

**Recommended: Option B.** Cleaner long-term.

---

## Rough scope (~14 tasks for the full plan)

1. `apps/web` Vite project scaffold, imports from `apps/client/src/renderer`
2. Server: serve static `apps/web/dist` at `/web/*` OR run as separate Vite preview build
3. Cookie-based auth: server issues `Set-Cookie: rv_session=<jwt>; HttpOnly; Secure; SameSite=Lax`
4. `ApiClient` variant for web that uses cookies (no `setToken` needed — browser sends automatically)
5. Replace `window.redvoice` adapter for web: token stored in cookie; `getDisplayMedia` called directly; platform detection
6. PTT: fall back to app-focused `keydown` handler; show note in Settings
7. Fix login → dashboard routing (no auth-context singleton — per-tab state)
8. CSP tightening: `connect-src` only for live API host; `media-src` for LiveKit
9. HTTPS enforcement: server redirects HTTP → HTTPS when `PROD_HOSTNAME` is set
10. Responsive layout fixes (mobile web viewport — tablet ok, phone hard)
11. Graceful degradation when features unavailable (e.g. Safari without getDisplayMedia)
12. OG tags + favicon + proper HTML title for SEO
13. Server deploy: `apps/web/dist` shipped as part of the Docker stack; Cloudflare tunnel covers it
14. Link from desktop app README + in-app Changelog: "prefer the desktop client for best experience; web available at voice.yourdomain.com"

---

## Non-goals for web v1

- iOS Safari fully working — getDisplayMedia is partial on iOS Safari; test but don't block
- Background updates via Service Worker — PWA install is optional
- Screen recording / camera publishing from the web on iOS — Safari limitations
- Push notifications — requires a whole subscription pipeline, defer

---

## Acceptance criteria

- Load `https://voice.yourdomain.com` on Chrome + Firefox → see login screen
- Register + log in → Lobby
- Create a room → join with someone on desktop RedVoice → audio both ways
- Screenshare from web → desktop user sees it
- Copy room link from desktop → paste into web tab → joins

---

## Known limitations (baked-in, not bugs)

- No global push-to-talk (browser sandbox)
- No always-on-top picture-in-picture (browser limits)
- No OS deep-link handler (`redvoice://` deep links open the desktop app, not the web tab)
- Settings persistence in `localStorage` only — cleared by cache clears
- Session cookie doesn't survive cross-origin (unlike Electron's safeStorage)

---

## When to write the full plan

After Plan 5 ships v0.2.0 and it's been running for ≥2 weeks with real friends without critical bugs, decompose into ~14 subagent-sized tasks.
