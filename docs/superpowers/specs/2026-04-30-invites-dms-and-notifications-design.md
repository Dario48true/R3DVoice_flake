# RedVoice — Invites, DM Surfacing, and Notifications

- **Status**: Approved for planning
- **Date**: 2026-04-30
- **Owner**: R3dWolfie
- **Repo**: `/var/home/red/Projects/RedVoice`
- **Predecessor**: [`2026-04-24-redvoice-design.md`](./2026-04-24-redvoice-design.md) (Bare MVP)
- **Position in roadmap**: Sub-project #1 of four (others: Discord-parity screenshare research, Discord-parity screenshare implementation, UI/UX makeover)

## Goal

Make RedVoice a thing you can actually invite friends to use. Today the only "invite" surface is a `RoomInfoPanel` text field that asks for the recipient's internal UUID — unusable. Friends must self-register on the server *before* they can be added as friends, defeating the onboarding loop. DMs exist but are buried in a modal nobody finds. Notifications barely exist — no persisted unread state, no OS notifications, no mute model.

This spec defines a single coherent slice of work that:

1. Replaces the broken invite UX with a real shareable-link system (rooms and friends, both flavors).
2. Introduces `@handle` as the primary public identifier for users — friend-by-handle, share-by-handle, search-by-handle.
3. Promotes DMs from a modal to a top-level navigation surface.
4. Adds an actual notification system (unread state, OS notifications, mute model, `@`-mentions).
5. Performs incidental lobby cleanup that falls out of (1)–(4) — top bar drops from 9 distinct controls to 4.

## Non-Goals (deferred — explicit)

These belong to later sub-projects or are unjustified at current scale:

- Cross-server federation (`@user@otherserver.com`). Same-server only. Handle is `@<handle>`; the `@<server>` half is implicit and not stored.
- "Servers / communities / guilds" concept à la Discord. Rooms stay flat top-level entities.
- Group DMs (3+ participants in a single thread). 1:1 only.
- Voice channels per server. Rooms remain first-class.
- Push notifications for *offline* users (would require APN/FCM/web-push infra; the desktop client is what fires notifications).
- Custom notification sounds beyond a default ping. Skin-layer concern, defer.
- Notification center / history view. The OS handles its own history.
- Notifications for incidental room events (somebody joined a room you're not in) — only mention-of-you and explicit invite events fire.
- Discord-parity screenshare features (quality picker per-stream, theater mode, stream chat overlay) — covered by sub-project #3.
- Mega-component refactors of `InRoomScreen.tsx` (2072 lines) and `SettingsModal.tsx` (1347 lines) — covered by sub-project #4.

## Product Decisions (locked)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Invite scope | Unified system, `kind: 'room' \| 'friend'` | Both use cases real ("come to room", "friend me"). One mechanism is simpler than two. |
| 2 | Public identity | `@handle` system replaces email as the public identifier | Email is private; people don't share it. `@red` reads infinitely better in copy. Matches Discord/Twitter mental model. |
| 3 | Invite link "personality" | Both flavors, Discord-style as default | Default = 7d expiry, unlimited uses. Opt-in toggles for "expires after one use" + custom expiry. Same data model either way. |
| 4 | Stranger-clicks-link UX | Preview page → register-or-sign-in → auto-redeem | Preview shows generic *"@red invited you to RedVoice"* (no room name leak). Either auth path branches to redemption. |
| 5 | DM layout | DMs as a separate top-level page | Removes nav clutter from lobby; mirrors Discord's "DMs home" pattern. Lobby stays focused on rooms. |
| 6 | Notifications scope | Unread state + OS notifications + mute model + `@`-mentions | Push for offline users / sounds / history view all explicitly out. |
| 7 | Friend semantics | Add-by-handle = pending friend request (recipient must accept). Redeem-friend-link = auto-accepted (clicking the link is the acceptance). | Asymmetric on purpose. Direct request needs consent; explicit click of someone's link *is* consent. |
| 8 | Authority for room invites | Any room member can create. Owner can revoke any. | Discord-default behavior. Lowers friction for the common case. |
| 9 | Cross-server | Same-server only | Self-host is the deployment model; federating handles is a separate, large project. |
| 10 | Migration | Existing users prompted to pick a handle on next login. One-time gate. | Backfill is interactive, not silent — uniqueness collisions resolve themselves at the keyboard. |

## Data Model

### `User` — additions

```sql
ALTER TABLE User ADD COLUMN handle TEXT UNIQUE;  -- nullable until backfilled
ALTER TABLE User ADD COLUMN dndUntil DATETIME;   -- null = not in DND

CREATE INDEX idx_user_handle ON User(handle);
```

- `handle`: `[a-z0-9_]{3,24}`, lowercase, unique server-wide.
- Validation lives in shared zod schema `userHandleSchema`.
- Existing users have `handle = NULL` until they pick one (gated on next login).

### `Invite` — new table

```sql
CREATE TABLE Invite (
  id            TEXT PRIMARY KEY,                   -- internal UUID
  code          TEXT NOT NULL UNIQUE,               -- 8 chars, URL-safe alphabet excluding 0/O/1/l
  kind          TEXT NOT NULL CHECK (kind IN ('room','friend')),
  creatorId     TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  targetRoomId  TEXT REFERENCES Room(id) ON DELETE CASCADE,  -- non-null iff kind='room'
  expiresAt     DATETIME,                           -- null = never
  maxUses       INTEGER,                            -- null = unlimited
  uses          INTEGER NOT NULL DEFAULT 0,
  revokedAt     DATETIME,                           -- soft-revoke
  createdAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invite_code   ON Invite(code);
CREATE INDEX idx_invite_creator ON Invite(creatorId);
```

Constraint: `(kind = 'room') = (targetRoomId IS NOT NULL)`. Enforced in application code via Zod schema; SQLite CHECK can express it but Prisma layer is cleaner.

### Code generation

8-char alphabet: `ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789` (54 chars, `0/O/1/l/I` excluded).

Birthday-paradox math: `54^8 ≈ 7.2e13`. At ~10⁵ active codes (orders of magnitude beyond reality), collision probability is `~10¹⁰⁻⁵ / 7.2×10¹³ ≈ 7×10⁻⁵` — fine. Single retry on insert collision.

### `ThreadReadState` — new

```sql
CREATE TABLE ThreadReadState (
  userId       TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  threadType   TEXT NOT NULL CHECK (threadType IN ('room','dm')),
  threadId     TEXT NOT NULL,
  lastReadAt   DATETIME NOT NULL,
  PRIMARY KEY (userId, threadType, threadId)
);
```

Upserted by `POST /chat/read`. `threadId` for DMs uses the existing canonical-pair format (`<userIdA>:<userIdB>` sorted).

### `ThreadMuteState` — new

```sql
CREATE TABLE ThreadMuteState (
  userId       TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  threadType   TEXT NOT NULL,
  threadId     TEXT NOT NULL,
  level        TEXT NOT NULL CHECK (level IN ('all','mentions','none')),
  mutedUntil   DATETIME,                           -- null = indefinite
  PRIMARY KEY (userId, threadType, threadId)
);
```

Row only present when level differs from default (`'all'`). Default is implicit, not stored.

### `Message` — additions

```sql
ALTER TABLE Message ADD COLUMN mentions JSON;   -- array of mentioned userIds, denormalised at send
```

Server parses `@handle` tokens against thread participants on `POST /chat/messages` and writes the resolved userId list. Empty array when no mentions.

## Server Changes

### Routes — invites

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/invites` | Bearer | Create invite. Body: `{ kind, targetRoomId?, expiresAt?, maxUses? }`. Returns `{ id, code, kind, ... }`. |
| GET | `/invites` | Bearer | List invites I created. Filter by `?kind=` and `?roomId=`. |
| GET | `/invites/:code` | None (public) | Public preview metadata: `{ creator: { handle, displayName }, kind, expiresAt, maxUses, uses, revokedAt }`. **Does not include `targetRoomId` or room name** — strangers can't enumerate room names. Rate-limit aggressively. |
| GET | `/invites/:code/full` | Bearer | Authed preview — same as public plus `targetRoom: { id, name, memberCount }` when `kind='room'`. Used by the in-app preview screen to render the room name on the *Join* button before the user commits to redemption. |
| POST | `/invites/:code/redeem` | Bearer | Redeem. Server validates, performs the action (room membership upsert OR auto-accepted friendship), increments `uses`, returns `{ kind, redirectTo }` where `redirectTo` is `'/rooms/<id>'` or `'/dms'`. |
| DELETE | `/invites/:id` | Bearer (creator or room owner) | Soft-revoke (`revokedAt = now`). |
| GET | `/invite/:code` (singular) | None (public) | **HTML page** — server-rendered preview for browser visitors. Calls the same data path as `GET /invites/:code` internally. Singular path is a stylistic split: `/invites/*` JSON, `/invite/<code>` HTML. |

Validation rules on redeem (in order):
1. Code exists. 404 if not.
2. Not soft-revoked. 410 if revoked.
3. Not past `expiresAt`. 410 if expired.
4. `uses < maxUses` if `maxUses` set. 409 if full.
5. For `kind='friend'`: not redeeming your own invite (creator ≠ caller). 400 if self.
6. For `kind='room'`: room still exists, not already a member. Idempotent if already member.
7. Action performed atomically with `uses++` in a transaction.

### Routes — handles

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/me/handle` | Bearer | One-time set. Body: `{ handle }`. Validates schema, uniqueness. 409 on collision. |
| GET | `/users/by-handle/:handle` | Bearer | Resolve handle → `{ id, handle, displayName }`. 404 if unknown. |
| POST | `/friends/request-by-handle` | Bearer | Body: `{ handle }`. Same effect as `/friends/request` but looks up by handle instead of email. |

`POST /me/handle` is the migration gate — once `User.handle` is set, the endpoint returns 409 ("already set"). Admin override (DB-level) is the only escape hatch for typos.

### Routes — chat / notifications

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/chat/read` | Bearer | Body: `{ threadType, threadId, lastReadAt }`. Upserts `ThreadReadState`. Idempotent. |
| GET | `/chat/unread` | Bearer | Returns `{ counts: { [`<threadType>:<threadId>`]: number }, totalUnread: number }`. Excludes muted threads (per mute level). |
| PATCH | `/chat/threads/:threadType/:threadId/mute` | Bearer | Body: `{ level, mutedUntil? }`. Upserts `ThreadMuteState`. Pass `level='all'` and no `mutedUntil` to clear. |
| PATCH | `/me/dnd` | Bearer | Body: `{ until? }`. Sets/clears `User.dndUntil`. |

### WebSocket events — new

Existing chat WS (`/ws`) gets new event kinds:

```ts
type WsServerEvent =
  | { kind: 'chat.message', message: MessageDTO }                    // existing
  | { kind: 'chat.mention', threadType, threadId, message, mentionedHandle }  // NEW
  | { kind: 'friend.request', from: { handle, displayName } }        // NEW
  | { kind: 'friend.accepted', by: { handle, displayName } }         // NEW
  | { kind: 'invite.redeemed', code, by: { handle, displayName }, kind, targetRoomId? }  // NEW
```

Client routes mention/friend/invite events through the notification pipeline (mute lookup → OS notification → in-app toast).

### Mention parsing

On `POST /chat/messages`, server tokenizes the body for `@<handle>` matches against the participant set:

- Room threads: participants = room members.
- DM threads: participants = the two thread participants.

Resolved userIds are stored in `Message.mentions`. WS broadcast for the message includes the mention array; mentioned-user receives a separate `chat.mention` event for notification routing (this is what bypasses thread-mute when level is `'mentions'`).

## Client Changes

### New surfaces

- **Handle-pick gate**: shown after login when `User.handle === null`. Modal with input, live availability check, submit. Cannot be dismissed.
- **Preview page** (web — server-rendered HTML at `/invite/<code>`): no React/SPA bundle, just enough HTML to render the preview + the two auth links. Each link carries `?invite=<code>` through.
- **In-app preview screen** (deep-link `redvoice://invite/<code>` lands here when authed; same code that handles the `?invite=<code>` query post-auth): single screen with the same "Studio Floor — invited by @red" framing, but with the room name now revealed (you've authenticated). Big *Join* button. Cancel returns to lobby.
- **Invite-create modal**: opens from RoomInfoPanel "Invite" button OR from lobby "+ Add Friend → By link" tab. Inputs: *Expires* dropdown (1h / 1d / 7d (default) / never), *One-time use* toggle (when on, sets `maxUses=1` on the POST; when off, sends `maxUses=null` for unlimited). Output: copy-link button with the resolved URL. Live preview of the link.
- **Add Friend popover**: lives in the DMs page top bar. Two tabs:
  - *By handle* — input, autocomplete from accepted-friend list (for re-finding handles you've seen) + free entry. Enter sends a request.
  - *By link* — generates a `kind=friend` invite. Same modal as above.
- **My Invites mini-view**: scrolling list of active codes I created (room and friend), each with code, target, expiry, uses-remaining, copy + revoke buttons.
- **DMs page**: dedicated top-level route (described below).

### DMs page layout

Lobby and DMs sit side-by-side under a new ~48px-wide left **icon column**:

```
┌──────┬─────────────────────────────────────────────────────────┐
│ 🏠   │  Lobby (rooms create/join, my rooms list, recents)      │
│ 💬   │                                                          │
│      │                                                          │
│   ⚙  │                                                          │
└──────┴─────────────────────────────────────────────────────────┘
```

Active icon highlighted. Settings/Logout move to the bottom of the icon column.

DMs page (when 💬 active):

```
┌──────┬────────────────────┬──────────────────────────────────┐
│ 🏠   │ DMs        [+ New] │  @bob                            │
│ 💬*  │ ──────────────────│  ──────────────────────────────  │
│      │ ⦿ @bob   "lol ok" │  (message list scroll)           │
│      │   @alice "see u"  │                                  │
│      │ Friends ▸          │                                  │
│   ⚙  │                    │  [composer]                      │
└──────┴────────────────────┴──────────────────────────────────┘
```

- Left rail (~280px): scrollable thread list, sort by last-message-at desc, unread dot left of handle, online indicator next to handle.
- *+ New* opens the handle picker (same component as Add Friend → By handle).
- *Friends ▸* expands a sub-pane that lists current friends (online first), pending incoming/outgoing requests with accept/reject affordances. The existing FriendsModal logic moves here.
- Center pane: standard message thread + composer. Empty state when nothing selected: a generous *"Start a conversation"* prompt with the picker.
- Right pane: none for v1.

Composer adds:
- `@` typing triggers an autocomplete popover filtered by the thread's participant set.
- Selecting an autocomplete entry inserts `@<handle>` and tokenizes it visually (different color in the rendered message).

### Lobby cleanup (incidental)

Removed:
- Top-bar wordmark + "REDVOICE · LOBBY" breadcrumb (icon column owns identity).
- Top-bar **Friends** button (moved into DMs page).
- Top-bar **DMs** button (replaced by 💬 in icon column).
- Bottom **SERVER / RTT / BUILD** stat tiles (moved to Settings → Diagnostics).

Kept:
- Connected pill, your avatar+name, Settings ⚙ (now in icon column), Logout.
- Create-room card.
- Join-by-link card.

Net: top bar drops from **9** distinct things to **4** (connected pill, avatar, settings, logout — last two relocate to the icon column, leaving just two on top). Lobby center is undisturbed.

### Notification routing (client-side)

```
WS event arrives
   │
   ▼
Identify (threadType, threadId) and event kind
   │
   ├── If chat.mention OR friend.request OR friend.accepted OR invite.redeemed
   │     │
   │     ▼
   │   Apply mute filter:
   │     - User.dndUntil > now? Suppress unless event is friend.request.
   │     - ThreadMuteState row level=='none'? Suppress.
   │     - level=='mentions' and event!=mention? Suppress.
   │     - else: continue.
   │     │
   │     ▼
   │   Fire OS notification via Electron main IPC.
   │   Update unread count in store (re-render badge).
   │   Show in-app toast.
   │
   └── If chat.message (no mention):
       Update unread count in store.
       No OS notification.
```

Electron main process exposes `redvoice.notify(payload)` over the existing context-bridge. Renderer never touches the `Notification` API directly so the main can apply user-provided suppression and click-through deep-linking.

## Migration

1. Schema migration (Prisma) — adds `User.handle`, `User.dndUntil`, `Invite`, `ThreadReadState`, `ThreadMuteState`, `Message.mentions`.
2. Server boots cleanly with `User.handle = NULL` for all rows. No data backfill at this stage.
3. Client login flow checks `User.handle`. If null, mount the handle-pick gate before reaching the lobby.
4. Existing room "Invite by user ID" UI is removed in the same commit that lands the new invite-create modal.
5. After 14 days, server adds a non-blocking warning if `User.handle` is still null (covers users who never logged in during the migration window). After 30 days the gate becomes blocking on every API call until set. (Bake into a follow-up commit, not v0.6.)

## Testing Strategy

### Server (Vitest)

- **Invite creation**: code uniqueness under contention, kind/targetRoomId mutual-exclusion, expiry timestamps round-trip correctly, `maxUses=null` is unlimited.
- **Redemption**: rejects expired/revoked/full, idempotent on retry (room kind: already-member returns `redirectTo` without double-incrementing `uses`), self-redeem rejected, transactional `uses++` doesn't overshoot under concurrent redeems.
- **Handle**: case-insensitive lookup (`@RED` resolves same as `@red`), validation rules `[a-z0-9_]{3,24}`, uniqueness collisions return 409, `POST /me/handle` rejects double-set.
- **Friend-by-handle**: same shape as friend-by-email but on handle path; existing tests parameterize.
- **Read state**: `lastReadAt` upsert idempotency; unread count math under mute level transitions; mention overrides mute when `level='mentions'`.
- **DND**: time-window honoring; expiry auto-clears.
- **Mention parsing**: matches only against thread participants; no false-positive on `email@example.com`-shaped tokens; survives Unicode-name edge cases.

### Client (Vitest)

- Composer `@`-autocomplete: filter, keyboard navigation, selection, insertion.
- Notification pipeline filter logic (DND, mute level, mention override).
- Unread store reactivity: badge math updates on read-marker move.
- FriendsModal-equivalent (now in DMs page) handle/email/link entry parser.

### Manual

- Handle-pick gate appears for migrated users; survives reload; can't be dismissed; uniqueness collision shows real-time error.
- End-to-end invite flow in a fresh browser (no app) → preview page renders → register inside the same tab → land in the right place.
- OS notifications fire on Linux (libnotify), Windows (toast), macOS (banner). Click routes to the right thread.
- DM unread dot reactive across two open clients.

## Risks / Open Questions

- **Web preview page rendering**: needs server-side HTML templating. The existing app server is Fastify with no templating engine. Pick: (a) hand-rolled string templates (cheap, no deps), (b) `@fastify/view` + EJS/Handlebars (ergonomic but adds dep). Recommend (a) — the page is ~50 lines and adding a templating engine for one page is overkill. *Decided.*
- **Backfilling handles for existing users**: the gate is interactive, but a user who never logs in has `handle = NULL` indefinitely. Their `@handle` cannot be resolved by anyone. Acceptable — they're inactive — but worth noting.
- **Mention spam**: `@everyone`-style or repeated `@bob` mentions to harass. v1 has no rate limit. If observed in practice, add per-recipient mention rate-limit (e.g. 5/min) in a follow-up. Not blocking.
- **Handle uniqueness vs server-scoped**: documented as same-server only. Federated `@bob@server.com` is an explicit non-goal. The handle column does not encode server. If federation is ever added, handles become composite — non-trivial, separate spec.
- **Existing `displayName` field**: stays. Users have both `displayName` (mutable, presentation) and `handle` (immutable post-set, identity). This mirrors Discord's split.
- **Large message history performance with mentions**: mention denormalisation lets us query by mentioned user without scanning bodies. SQLite JSON column is indexable. Probably fine at our scale; revisit at >100k messages.

## Implementation Order (informational — formal plan in writing-plans output)

1. Schema migration + handle-pick gate (no UX changes elsewhere).
2. Invite system server-side: routes, redemption, mention parsing.
3. Invite create UX in `RoomInfoPanel` (replaces UUID field) + Add Friend popover + My Invites.
4. Preview page (server-rendered HTML).
5. DMs page (new route, icon column, layout).
6. Lobby cleanup (top bar surgery + stat tile relocation).
7. Notifications: read state, unread API, mute model, WS events, OS notification routing.
8. Mention UX: composer autocomplete, rendered tokenization.

Each step independently mergeable, ordered to keep `main` shippable at every commit.
