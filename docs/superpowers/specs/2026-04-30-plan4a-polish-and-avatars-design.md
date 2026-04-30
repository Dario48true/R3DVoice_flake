# Plan 4A — Polish + Profile Pictures (v0.9.0)

**Date:** 2026-04-30
**Status:** Approved (brainstorm), ready for implementation plan
**Target version:** v0.9.0
**Estimated effort:** 4 days

---

## Goals

Tighten the v0.8.1 surface area before tackling Plan 5 (Discord-parity screenshare). Specifically:

1. Make the registration flow simple — no two-name-fields confusion
2. Add profile pictures cheaply — URL-only, no upload pipeline
3. Close two stubs left over from v0.8.1
4. Make the app readable on a 4K display
5. Replace the worst error messages
6. Move Changelog out of SettingsModal

---

## Non-goals

- Server-side avatar uploads (deferred to a later plan)
- Avatar moderation, content filtering, or NSFW detection
- Live updates of avatar across already-loaded clients (next refresh is fine)
- Per-server emoji or rich profile customization
- SettingsModal full decomposition (out of Plan 4A; could be a separate refactor plan later)

---

## Architecture

### Server

**Schema change** — one new column on `User`:

```prisma
model User {
  // ...existing fields
  avatarUrl String?  // https URL, max 2048 chars
}
```

**Migration**: hand-written `apps/server/prisma/migrations/<ts>_add_avatar_url/migration.sql`. Per project convention we don't use `prisma migrate dev` (non-interactive-hostile in this setup).

**New file** — `apps/server/src/auth/handle-generator.ts`:

```ts
export async function generateUniqueHandle(displayName: string): Promise<string>
```

Algorithm:
1. Lowercase `displayName`
2. Replace whitespace with `_`
3. Strip everything except `[a-z0-9_]`
4. Truncate to 20 chars
5. If empty after cleaning, fallback to `"user"`
6. Query `findUnique({ where: { handleLower: candidate } })`
7. If taken, append `_2`, `_3`, ... until unique
8. Return final handle

Used by `POST /auth/register` only.

**Modified endpoints:**

- `POST /auth/register` — drops `handle` from request schema. Server calls `generateUniqueHandle(displayName)` and writes both `handle` and `handleLower`.
- `PATCH /me` — extends to accept `avatarUrl: z.string().url().max(2048).startsWith("https://").nullable().optional()`. Setting `null` clears the avatar.
- `POST /me/handle` — unchanged. Existing power-user rename flow stays.

### Shared types

`packages/shared/src/index.ts`:
- `UserDTO.avatarUrl?: string | null`
- `registerSchema` drops the `handle` field
- New `updateProfileSchema` (or extend existing) to validate `avatarUrl`

### Client

**New unified avatar component** — `apps/client/src/renderer/src/components/Avatar.tsx`:

```tsx
type Props = {
  src?: string | null;
  fallbackInitials: string;     // pulled from displayName
  fallbackColorSeed: string;    // pulled from userId for deterministic color
  size: number;                 // px
  shape?: "circle" | "rounded"; // default circle
};
```

Behavior:
- If `src` is set, render `<img src={src} onError={() => setBroken(true)}>`
- On `broken` or `src == null`, render the existing initials-circle JSX (extracted from current ad-hoc usages)
- One source of truth for the visual treatment

Replaces ad-hoc initials circles in:
- `FriendsPane`
- `DmsScreen` thread rows
- `RoomChatPanel` message bubbles
- `InRoomScreen` participant tiles
- User header / mini-profile area
- `@`-autocomplete popover items

**Modified — `RegisterForm.tsx`:**
- Drop the Handle input field
- Three inputs only: email, password, displayName
- After successful registration, show a one-time confirmation line: "Welcome — your handle is `@<generated>`. You can change it later in Settings."

**Modified — `SettingsModal.tsx` Account tab:**
- New row: "Profile picture URL" — text input + live preview (Avatar component on the right)
- HTTPS-only validation in client (server enforces too)
- Existing handle row gets a subtitle: "Used for `@mentions`. Most people leave this alone."
- Existing displayName row stays unchanged

**Modified — `SettingsModal.tsx` structure:**
- Drop the "Changelog" tab entirely
- Drop the existing Changelog renderer (the auto-fetch logic from `feedback_sync_patch_notes` memory) — the GitHub release page renders the same notes
- About tab: add a "What's new" link row → opens `https://github.com/R3dWolfie/RedVoice/releases` via `shell.openExternal`

**New component** — `apps/client/src/renderer/src/components/UpdateToast.tsx`:
- Reads `localStorage.getItem("redvoice.lastSeenVersion")` on mount
- Reads current version via the existing IPC bridge (`window.electron.getAppVersion()` or equivalent)
- Decision tree:
  - `lastSeenVersion === null` → write current version, do NOT show toast (first install)
  - `lastSeenVersion === currentVersion` → no-op
  - `lastSeenVersion !== currentVersion` → render toast: "Updated to v<X> — see what's new"
- On click: `shell.openExternal` to `https://github.com/R3dWolfie/RedVoice/releases/tag/v<currentVersion>`, then dismiss
- On dismiss (X or click): write current version to localStorage, unmount
- Mounted once near App.tsx root, after auth hydration completes (no point showing pre-login)

**Modified — `chat-transport.ts`** (v0.8.1 carryover #3):
- Add private field `_muteLevelCache: Map<string, MuteLevel>` keyed by `${threadType}:${threadId}`
- Add public method `getMuteLevel(threadType, threadId): Promise<MuteLevel>`:
  - If cached, return immediately
  - Else fetch from `GET /chat/threads/:type/:id/mute`, populate cache, return
- Add `setMuteLevel(threadType, threadId, level)` to invalidate + repopulate after mutation
- Replace the current hardcoded `"all"` lookup in the OS-notification gate with `await getMuteLevel(...)`
- Acceptable race: notification fires once at "all" while cache loads; subsequent events use the right level. v0.9.0 single-user case rarely matters.

**Modified — `FriendsPane.tsx`** (v0.8.1 carryover #4):
- The "in <Room> →" link is currently a stub
- Wire `onClick`: call `roomStore.joinRoom(friend.user.currentRoom.id)` if it's a public room
- For private rooms (server returns 403), swallow the error and surface a small toast: "That room is private"

**4K UI sizing pass:**
- Bump `:root { font-size: 15px }` (currently 14px) — global ~7% scale up
- Grep `apps/client/src/renderer/src/` for hardcoded `px` in CSS-in-JS style props for `fontSize`, `padding`, `margin`, `width`, `height`
- Replace with the existing CSS variables (`var(--t-sm)`, `var(--s-3)`, etc.) where the variable already exists
- Replace fixed modal widths like `width: 720px` with `width: min(90vw, 720px)` so the modal shrinks on small windows but doesn't overflow on 4K
- This is an audit pass, not a redesign — same visual hierarchy, just consistent units

**Error message rewrites:**
- `"register failed"` → use the server-returned message (e.g. "Email already in use")
- `"login failed"` → "Incorrect email or password" (don't reveal which)
- `"ACCESS_DENIED"` from WS → "You don't have access to this thread" (toast)
- `"invalid token"` → silent + auto-redirect to login screen
- `"missing auth subprotocol"` → silent + auto-redirect to login screen
- `"two-factor verification failed"` → keep as-is (already user-friendly)

---

## Data flow

### Avatar URL

```
User pastes URL in Settings → Account
  → SettingsModal validates client-side (https, length)
  → PATCH /me { avatarUrl }
  → Server validates with zod schema
  → DB write
  → Response: updated UserDTO with avatarUrl
  → Auth store updates state.user
  → All <Avatar> components re-render with new src
```

For other users' avatars: they arrive in `UserDTO` whenever a user is fetched (friend lists, DM threads, room participants, message authors). Clients never fetch avatars individually — they're a string field on the user object.

### Update toast

```
App.tsx mounts
  → Auth hydration completes
  → UpdateToast mounts, reads localStorage["redvoice.lastSeenVersion"]
  → Reads current version via IPC
  → If mismatch (and not null): render toast
  → User clicks → shell.openExternal + write currentVersion to localStorage
  → User dismisses → write currentVersion to localStorage
```

### Handle generation at registration

```
RegisterForm submits { email, password, displayName }
  → POST /auth/register
  → Server: generateUniqueHandle(displayName)
  → Server: prisma.user.create({ email, password, displayName, handle, handleLower, ... })
  → Returns { token, user }
  → Client persists token, transitions to authenticated
  → Toast/banner: "Welcome — your handle is @<handle>"
```

---

## Migration

- **Existing accounts**: untouched. They already have `handle`, `handleLower`, `displayName`. The server-side `generateUniqueHandle` only runs at registration. `avatarUrl` defaults to `null`.
- **Existing Changelog UI**: removed. Users open Settings → About → "What's new" or rely on the update toast going forward.
- **First launch after upgrade to v0.9.0**: the UpdateToast fires once. After dismiss, gone for v0.9.0. If they update to v0.10.0, fires again.

No data loss, no forced re-login, no schema break.

---

## Testing

### Server

- `apps/server/tests/handle-generator.test.ts`:
  - Generates `john` from `"John"`
  - Generates `r3dwolfie` from `"R3dWolfie"`
  - Strips emoji: `"R3d 🐺"` → `r3d_`
  - Empty after cleaning: `"🐺"` → `user`
  - Truncates >20 chars
  - Suffix on collision: when `john` exists → returns `john_2`
  - Repeat collision: `john`, `john_2` exist → returns `john_3`

- `apps/server/tests/avatar-validation.test.ts`:
  - Accepts valid https URL
  - Rejects http URL
  - Rejects URL >2048 chars
  - Accepts null (clear)
  - Rejects non-URL string

- Existing `me-and-logout.test.ts` updated to expect `avatarUrl: null` in `/me` response

### Client

- `Avatar.test.tsx`:
  - Renders `<img>` when `src` set
  - Falls back to initials on `onError`
  - Falls back to initials when `src` null/undefined
  - Initials match the first letter of displayName
  - Color seed produces deterministic class

- `UpdateToast.test.tsx`:
  - Renders when localStorage version differs from current
  - Does not render on first install (null localStorage)
  - Does not render when versions match
  - Click writes new version + invokes shell.openExternal
  - Dismiss writes new version

- Manual smoke tests:
  - Register without handle field → confirm @handle is auto-derived
  - Paste avatar URL → confirm renders in friend list, message bubbles, in-room tile
  - Click "in <Room> →" on FriendsPane → joins room
  - Open SettingsModal → no Changelog tab → About tab has "What's new" link

---

## Risks

1. **Avatar URL is a tracking-pixel vector.** A pasted URL could be hosted somewhere that logs every fetch (revealing approximate IP and user-agent of every viewer). Acceptable for v0.9.0: RedVoice is single-server self-hosted; the operator can set policy later. Mitigation: https-only, length-capped. Future hardening: server-side image proxy that re-hosts on first fetch.

2. **Update toast misfires on first install.** If `lastSeenVersion` is null on a fresh install, naive logic would show "Updated to v0.9.0" to a brand-new user — confusing. Fix in spec: on null, write current version *without* showing the toast.

3. **Handle generator collision storms.** If N users simultaneously register the same displayName, the algorithm is O(N) sequential lookups for the Nth registrant. Irrelevant at RedVoice scale. If it becomes a problem in the future, swap to UUID suffix or a 4-char random suffix.

4. **4K sizing audit accidentally breaks small-window layouts.** Bumping the root font size from 14px to 15px scales everything proportionally — cards, modals, paddings all grow ~7%. Could push a few layouts past their breakpoints. Mitigation: smoke-test at 1366x768 (small laptop) and 3840x2160 (4K) after the change.

5. **Removed Changelog tab + GitHub release page is private/missing.** If the GitHub release for v<X> doesn't exist (e.g. CI failed to publish), the "What's new" link 404s. Acceptable: the underlying memory `feedback_sync_patch_notes` already covers our release-creation flow. We rely on it.

6. **chat-transport mute cache and a fresh mute-change.** If user A mutes a thread, user B (same client, no — single-user app) wouldn't see it. Single-user case so this is fine. Multi-window single-user could theoretically diverge across windows but that's an extreme edge case.

---

## Out of scope (deferred to later plans)

- SettingsModal decomposition (1347 lines → still 1347 minus the Changelog tab; full split is its own refactor plan)
- InRoomScreen decomposition (2072 lines, separate refactor)
- Server-side avatar uploads
- Bottom-left persistent user panel (Discord parity, Plan 5+ candidate)
- Friend rich-status cards (Plan 5+)
- Emoji reactions, replies, message search (post-MVP features)

---

## Sources of decisions

- **C for handle/displayName** (Q1 of brainstorm) — auto-generated handle, displayName as primary, "make it simple" thread
- **B for avatars** (Q2) — URL-only fits Option A's 4-day budget; full upload pipeline is a v1.0+ concern
- **C for Changelog** (Q3) — toast on update + Settings link to GitHub releases; SettingsModal shrinks one tab
- **Memory `feedback_4k_ui_sizing`** — informs the 4K audit pass
- **Memory `feedback_require_approval`** — this design exists because no code was written before approval
