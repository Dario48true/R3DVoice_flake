# RedVoice Plan 2 — DMs Page + Lobby Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote DMs from a buried modal to a permanent top-level page reachable via a Discord-style left icon column, then delete the now-dead controls from the lobby's overloaded top bar. Net effect for users: lobby has 2 controls instead of 9; DMs are always one click away; an "@" handle dropdown lets you start a new DM with anyone.

**Architecture:** A new 48px-wide `LeftIconColumn` lives outside the routed content as a permanent sibling, hosting Lobby (🏠), DMs (💬), and a user identity panel at bottom (avatar → click for displayName + Settings + Logout). App.tsx gains a `topPage: 'lobby' | 'dms'` state that the column toggles. A new `DmsScreen` reuses the existing `RoomChatPanel` (already supports `threadType="dm"`) and a newly extracted `DmThreadList`. The existing `DmInboxModal` and `FriendsModal` are deleted; their contents fold into `DmsScreen` (Friends becomes a sub-tab in the left rail). The server's `/chat/dm-threads` endpoint is extended to include the other participant's identity so the UI no longer renders "(other participant)".

**Tech Stack:** Electron 35 + React 19 + Vite + Zustand (client), Fastify 5 + Prisma 6 (server), Vitest 2 (tests). Same stack as Plan 1.

**Spec reference:** `docs/superpowers/specs/2026-04-30-invites-dms-and-notifications-design.md` — Sections 4 (DMs page), 5 (lobby cleanup), and Decision Q5. Notifications + mentions (Section 6) are explicit non-goals; covered by a future Plan 3.

**Predecessor:** v0.6.0 (Plan 1 — handles + invites). This plan targets v0.7.0.

---

## File Structure

```
apps/server/
└── src/chat/
    └── routes.ts                                     # MODIFY: GET /chat/dm-threads includes otherParticipant {id, handle, displayName}
packages/shared/
└── src/index.ts                                      # MODIFY: extend DmThreadEntry DTO with otherParticipant field

apps/client/
├── src/renderer/src/
│   ├── App.tsx                                       # MODIFY: topPage state, mount LeftIconColumn alongside routed content
│   ├── components/
│   │   ├── LeftIconColumn.tsx                        # (new) 48px nav column — Lobby/DMs icons + bottom user panel
│   │   ├── UserPanelPopover.tsx                      # (new) avatar-click popover: displayName + @handle + Settings + Logout
│   │   ├── DmThreadList.tsx                          # (new) extracted thread list: rows + click-to-select
│   │   ├── NewDmPicker.tsx                           # (new) small popover for "+ New DM" — handle input → opens thread
│   │   ├── FriendsPane.tsx                           # (new) friend management embedded as left-rail sub-section
│   │   ├── DmInboxModal.tsx                          # DELETE — replaced by DmsScreen
│   │   └── FriendsModal.tsx                          # DELETE — contents move into FriendsPane (still mounts InviteCreateModal)
│   ├── screens/
│   │   ├── DmsScreen.tsx                             # (new) top-level page: thread list + active conversation + Friends pane
│   │   └── LobbyScreen.tsx                           # MODIFY: remove top-bar Friends/DMs/Logo/Settings/Logout/avatar (now in icon column)
│   └── lib/
│       └── dm-thread-id.ts                           # (new) tiny helper — canonical-pair threadId from two userIds
```

Total: 6 new files, 3 modified, 2 deleted.

---

## Pre-flight

- All v0.6.x commits (handles, invites, the UX-audit batch, the test-DB isolation fix) must be on `main`. Verify `git log --oneline -10` shows the commits up through the UI audit pass before starting.
- Run `pnpm --filter @redvoice/server typecheck && pnpm --filter @redvoice/client typecheck` and confirm clean before opening Task 1.
- Run `pnpm --filter @redvoice/server test` once. Two pre-existing failures (`rooms.test.ts > GET /rooms/:id … non-owner`, `token.test.ts > … RoomMembership on first token fetch`) are out of scope; nothing else should fail. Tests now use `prisma/test.db`, so they will not touch real data.

---

## Task 1: Server `dm-threads` includes other participant

**Files:**
- Modify: `apps/server/src/chat/routes.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/server/tests/chat-threads.test.ts` (or create if it doesn't yet cover this endpoint)

- [ ] **Step 1: Inspect existing DTO + test**

Run `grep -nE 'DmThreadEntry|dmThreads' packages/shared/src/index.ts apps/client/src/renderer/src/components/DmInboxModal.tsx` to find the existing `DmThreadEntry` shape. Read it before editing — your additions must extend it, not replace fields the existing modal still uses (until the modal is deleted in Task 9).

- [ ] **Step 2: Extend the DTO**

In `packages/shared/src/index.ts`, find `DmThreadEntry` and add the new field:

```ts
export interface DmThreadEntry {
  threadId: string;
  lastMessage: MessageDTO;
  /** Identity of the OTHER participant (not the caller). */
  otherParticipant: {
    id: string;
    handle: string | null;
    displayName: string;
  };
}
```

If `DmThreadEntry` doesn't exist as a named export today (it might be inline in a route DTO), add it as a new named export and have the server route return that exact shape.

Build the shared package:

```bash
pnpm --filter @redvoice/shared build
```

Expected: clean.

- [ ] **Step 3: Failing test**

In `apps/server/tests/chat-threads.test.ts` (create if missing), add:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "./helpers/app";
import { resetDb, registerUser, authHeader, setHandle } from "./helpers/fixtures";
import { prisma } from "../src/db";

describe("GET /chat/dm-threads", () => {
  beforeEach(() => resetDb());

  it("returns the other participant's identity, not the caller's", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com", displayName: "Alice" });
    const b = await registerUser(app, { email: "b@x.com", displayName: "Bob" });
    await setHandle(app, a.token, "alice");
    await setHandle(app, b.token, "bob");

    // Seed a single DM message so the thread exists.
    const threadId = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    await prisma.message.create({
      data: { threadType: "dm", threadId, authorId: a.id, body: "hello" },
    });

    // Alice asks for her DM threads — should see Bob.
    const res = await app.inject({
      method: "GET", url: "/chat/dm-threads", headers: authHeader(a.token),
    });
    expect(res.statusCode).toBe(200);
    const { threads } = res.json();
    expect(threads).toHaveLength(1);
    expect(threads[0].otherParticipant).toMatchObject({
      id: b.id,
      handle: "bob",
      displayName: "Bob",
    });
  });
});
```

If the test file already exists with other tests, append this `describe` block to it.

- [ ] **Step 4: Run — fails**

```bash
pnpm --filter @redvoice/server test chat-threads.test.ts
```

Expected: the new test fails (no `otherParticipant` in the response).

- [ ] **Step 5: Implement**

In `apps/server/src/chat/routes.ts`, the `/chat/dm-threads` handler currently aggregates messages and returns `{ threadId, lastMessage }`. Add a second pass that resolves the other participant:

```ts
app.get(
  "/chat/dm-threads",
  { preHandler: requireAuth },
  async (request) => {
    const userId = request.auth!.userId;
    const rows = await prisma.message.findMany({
      where: {
        threadType: "dm",
        OR: [{ threadId: { startsWith: `${userId}:` } }, { threadId: { endsWith: `:${userId}` } }],
      },
      orderBy: [{ createdAt: "desc" }],
      include: { author: { select: { displayName: true } } },
    });

    const seen = new Map<string, MessageDTO>();
    for (const m of rows) {
      if (seen.has(m.threadId)) continue;
      seen.set(m.threadId, toDTO(m));
    }

    // Resolve "the other half" of each canonical-pair threadId in one query.
    const otherIds = new Set<string>();
    for (const threadId of seen.keys()) {
      const [a, b] = threadId.split(":");
      otherIds.add(a === userId ? b! : a!);
    }
    const others = await prisma.user.findMany({
      where: { id: { in: [...otherIds] } },
      select: { id: true, handle: true, displayName: true },
    });
    const otherById = new Map(others.map((u) => [u.id, u]));

    const threads = Array.from(seen.entries()).map(([threadId, lastMessage]) => {
      const [a, b] = threadId.split(":");
      const otherId = a === userId ? b! : a!;
      const other = otherById.get(otherId);
      return {
        threadId,
        lastMessage,
        otherParticipant: {
          id: otherId,
          handle: other?.handle ?? null,
          displayName: other?.displayName ?? "(unknown)",
        },
      };
    });
    return { threads };
  },
);
```

- [ ] **Step 6: Run — pass**

```bash
pnpm --filter @redvoice/server test chat-threads.test.ts
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/chat/routes.ts apps/server/tests/chat-threads.test.ts packages/shared/src/index.ts
git commit -m "$(cat <<'EOF'
feat(server): /chat/dm-threads returns other-participant identity

Previously the DM thread list only carried { threadId, lastMessage }; the
client had to guess at the peer's name from authorId, falling back to
"(other participant)" when the last message was from the caller. The
endpoint now resolves the other half of each canonical-pair threadId in a
single batch query and returns { id, handle, displayName }, so the UI can
render the peer correctly regardless of who sent last.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Canonical thread-id helper

**Files:**
- Create: `apps/client/src/renderer/src/lib/dm-thread-id.ts`
- Create: `apps/client/tests/dm-thread-id.test.ts`

The helper exists inline in several places (server-side and probably the renderer). Centralizing keeps client + server semantics in lockstep when we add new entrypoints.

- [ ] **Step 1: Failing tests**

Create `apps/client/tests/dm-thread-id.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dmThreadId, otherParticipantId } from "../src/renderer/src/lib/dm-thread-id";

describe("dm-thread-id", () => {
  it("dmThreadId returns lexically-sorted pair regardless of input order", () => {
    expect(dmThreadId("aaa", "bbb")).toBe("aaa:bbb");
    expect(dmThreadId("bbb", "aaa")).toBe("aaa:bbb");
  });

  it("otherParticipantId returns the half that isn't the caller", () => {
    expect(otherParticipantId("aaa:bbb", "aaa")).toBe("bbb");
    expect(otherParticipantId("aaa:bbb", "bbb")).toBe("aaa");
  });
});
```

- [ ] **Step 2: Run — fails (module missing)**

```bash
pnpm --filter @redvoice/client test dm-thread-id.test.ts
```

- [ ] **Step 3: Implement**

Create `apps/client/src/renderer/src/lib/dm-thread-id.ts`:

```ts
/**
 * Canonical-pair encoding for DM thread IDs. Sorting the two user IDs
 * lexically means both participants resolve the same threadId without
 * coordinating, and the server can match either half via prefix/suffix.
 */
export function dmThreadId(userIdA: string, userIdB: string): string {
  return userIdA < userIdB ? `${userIdA}:${userIdB}` : `${userIdB}:${userIdA}`;
}

export function otherParticipantId(threadId: string, callerId: string): string {
  const [a, b] = threadId.split(":");
  if (a === callerId) return b!;
  return a!;
}
```

- [ ] **Step 4: Run — pass**

```bash
pnpm --filter @redvoice/client test dm-thread-id.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/renderer/src/lib/dm-thread-id.ts apps/client/tests/dm-thread-id.test.ts
git commit -m "feat(client): canonical DM thread-id helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Extracted `DmThreadList` component

**Files:**
- Create: `apps/client/src/renderer/src/components/DmThreadList.tsx`

This is a pure presentation component. Fetching/state stays in `DmsScreen` (Task 5). Extracting it lets us reuse the row styling and ensures the DmInboxModal-shaped logic doesn't leak into the new screen.

- [ ] **Step 1: Build the component**

Create `apps/client/src/renderer/src/components/DmThreadList.tsx`:

```tsx
import { type ReactElement } from "react";
import type { DmThreadEntry } from "@redvoice/shared";

type Props = {
  threads: DmThreadEntry[];
  activeThreadId: string | null;
  onSelect(threadId: string): void;
};

function avatarTone(seed: string): 1 | 2 | 3 | 4 | 5 {
  return ((seed.charCodeAt(0) % 5) + 1) as 1 | 2 | 3 | 4 | 5;
}

export function DmThreadList({ threads, activeThreadId, onSelect }: Props): ReactElement {
  if (threads.length === 0) {
    return (
      <div style={{ padding: "var(--s-4)", color: "var(--text-faint)", fontSize: "var(--t-sm)" }}>
        No conversations yet.
      </div>
    );
  }
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {threads.map((t) => {
        const active = t.threadId === activeThreadId;
        const peer = t.otherParticipant;
        const headline = peer.handle ? `@${peer.handle}` : peer.displayName;
        return (
          <li
            key={t.threadId}
            onClick={() => onSelect(t.threadId)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--s-3)",
              padding: "var(--s-2) var(--s-3)",
              borderRadius: "var(--r-md)",
              cursor: "pointer",
              background: active ? "color-mix(in oklch, var(--accent) 14%, transparent)" : "transparent",
              border: active ? "1px solid var(--accent)" : "1px solid transparent",
            }}
          >
            <span
              className="rv-avatar"
              data-tone={avatarTone(peer.id)}
              style={{ width: 32, height: 32, fontSize: 13, flexShrink: 0 }}
            >
              {(peer.displayName.charAt(0) || "?").toUpperCase()}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "var(--t-sm)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {headline}
              </div>
              <div style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.lastMessage.body ?? "(deleted)"}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @redvoice/client typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/renderer/src/components/DmThreadList.tsx
git commit -m "feat(client): DmThreadList — extracted thread-row rendering

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: New-DM picker

**Files:**
- Create: `apps/client/src/renderer/src/components/NewDmPicker.tsx`

A small popover that takes a handle, resolves it via `getUserByHandle`, and either opens an existing thread or creates a new one (which is just "navigate to threadId — server creates the thread on first message").

- [ ] **Step 1: Build the component**

Create `apps/client/src/renderer/src/components/NewDmPicker.tsx`:

```tsx
import { useCallback, useState, type ReactElement } from "react";
import { Modal } from "./Modal.js";
import { useAuthStore } from "../lib/auth-context.js";
import { ApiClient } from "../lib/api.js";
import { dmThreadId } from "../lib/dm-thread-id.js";

type Props = {
  open: boolean;
  onClose(): void;
  /** Called once a peer is resolved. Caller routes to that thread. */
  onPick(threadId: string, peer: { id: string; handle: string | null; displayName: string }): void;
};

export function NewDmPicker({ open, onClose, onPick }: Props): ReactElement {
  const me = useAuthStore((s) => s.user);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const token = useAuthStore((s) => s.token);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!me) return;
    const raw = value.trim().replace(/^@/, "");
    if (!raw) return;
    setBusy(true); setError(null);
    const api = new ApiClient(serverUrl); api.setToken(token);
    try {
      const peer = await api.getUserByHandle(raw);
      const threadId = dmThreadId(me.id, peer.id);
      onPick(threadId, peer);
      setValue("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "user not found");
    } finally {
      setBusy(false);
    }
  }, [me, serverUrl, token, value, onPick, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Start a conversation" width="min(92vw, 420px)">
      <p style={{ color: "var(--text-mid)", marginBottom: "var(--s-3)" }}>
        Type the @handle of the person you want to message.
      </p>
      <input
        autoFocus
        className="rv-input"
        placeholder="@handle"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
      />
      {error && <p style={{ color: "var(--accent)", marginTop: "var(--s-2)", fontSize: "var(--t-sm)" }}>{error}</p>}
      <button
        className="rv-btn"
        data-variant="primary"
        disabled={busy || !value.trim()}
        onClick={() => void submit()}
        style={{ marginTop: "var(--s-4)", width: "100%" }}
      >
        {busy ? "Looking up…" : "Open conversation"}
      </button>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @redvoice/client typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/renderer/src/components/NewDmPicker.tsx
git commit -m "feat(client): NewDmPicker — start a DM by @handle

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `DmsScreen` — the new top-level page

**Files:**
- Create: `apps/client/src/renderer/src/screens/DmsScreen.tsx`

Composes `DmThreadList`, `NewDmPicker`, and `RoomChatPanel` (which already supports `threadType="dm"`). Friends sub-pane comes in Task 6.

- [ ] **Step 1: Build the screen**

Create `apps/client/src/renderer/src/screens/DmsScreen.tsx`:

```tsx
import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { DmThreadEntry } from "@redvoice/shared";
import { useAuthStore } from "../lib/auth-context.js";
import { ApiClient } from "../lib/api.js";
import { DmThreadList } from "../components/DmThreadList.js";
import { NewDmPicker } from "../components/NewDmPicker.js";
import { RoomChatPanel } from "../components/RoomChatPanel.js";
import { I } from "../components/Icons.js";

export function DmsScreen(): ReactElement {
  const me = useAuthStore((s) => s.user);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const token = useAuthStore((s) => s.token);

  const [threads, setThreads] = useState<DmThreadEntry[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activePeer, setActivePeer] = useState<{ id: string; handle: string | null; displayName: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const api = new ApiClient(serverUrl); api.setToken(token);
    try {
      const r = await api.dmThreads();
      setThreads(r.threads);
    } catch { /* */ }
  }, [serverUrl, token]);

  useEffect(() => { void refresh(); }, [refresh]);

  // When user selects an existing thread, sync the displayed peer.
  useEffect(() => {
    if (!active) { setActivePeer(null); return; }
    const t = threads.find((x) => x.threadId === active);
    if (t) setActivePeer(t.otherParticipant);
  }, [active, threads]);

  const onPick = useCallback((threadId: string, peer: { id: string; handle: string | null; displayName: string }) => {
    setActive(threadId);
    setActivePeer(peer);
    void refresh();
  }, [refresh]);

  if (!me) return <div />;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr",
        height: "100%",
        background: "var(--bg)",
      }}
    >
      <aside
        style={{
          borderRight: "1px solid var(--border-soft)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", padding: "var(--s-3) var(--s-4)" }}>
          <span style={{ fontWeight: 600, fontSize: "var(--t-md)", flex: 1 }}>Direct messages</span>
          <button
            type="button"
            className="rv-btn"
            data-variant="primary"
            onClick={() => setPickerOpen(true)}
            style={{ height: "1.8rem", padding: "0 var(--s-3)", fontSize: "var(--t-sm)" }}
          >
            <I.Plus size={12} /> New
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "var(--s-2) var(--s-3)" }}>
          <DmThreadList threads={threads} activeThreadId={active} onSelect={setActive} />
        </div>
      </aside>

      <main style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        {active && activePeer ? (
          <>
            <header
              style={{
                padding: "var(--s-3) var(--s-5)",
                borderBottom: "1px solid var(--border-soft)",
                display: "flex",
                alignItems: "center",
                gap: "var(--s-3)",
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {activePeer.handle ? `@${activePeer.handle}` : activePeer.displayName}
              </span>
              {activePeer.handle && (
                <span style={{ color: "var(--text-faint)", fontSize: "var(--t-sm)" }}>{activePeer.displayName}</span>
              )}
            </header>
            <div style={{ flex: 1, minHeight: 0 }}>
              <RoomChatPanel threadType="dm" threadId={active} />
            </div>
          </>
        ) : (
          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--text-faint)", padding: "var(--s-7)" }}>
            <div style={{ textAlign: "center", maxWidth: 320 }}>
              <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600, color: "var(--text)", marginBottom: "var(--s-3)" }}>
                Start a conversation
              </h2>
              <p style={{ marginBottom: "var(--s-5)" }}>Click <strong>+ New</strong> to message someone by their @handle.</p>
              <button
                type="button"
                className="rv-btn"
                data-variant="primary"
                onClick={() => setPickerOpen(true)}
              >
                <I.Plus size={14} /> New conversation
              </button>
            </div>
          </div>
        )}
      </main>

      <NewDmPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={onPick} />
    </div>
  );
}
```

If `ApiClient.dmThreads()` doesn't exist, look up the existing call in `DmInboxModal.tsx` (it does — line ~32 in the current file) and use the same name.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @redvoice/client typecheck
```

If `RoomChatPanel`'s prop signature differs from `{ threadType, threadId }`, look at how it's called in `InRoomScreen.tsx` (around line 1803) and match.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/renderer/src/screens/DmsScreen.tsx
git commit -m "feat(client): DmsScreen — top-level page with thread list + chat pane

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `FriendsPane` + mount in DmsScreen

**Files:**
- Create: `apps/client/src/renderer/src/components/FriendsPane.tsx`
- Modify: `apps/client/src/renderer/src/screens/DmsScreen.tsx` (mount FriendsPane below thread list)

The Friends pane embeds the same friend-management logic that lives in FriendsModal today. Once this lands, FriendsModal can be deleted (Task 9).

- [ ] **Step 1: Build the component**

Read `apps/client/src/renderer/src/components/FriendsModal.tsx` first to understand the friend list / accept/reject / single-input add-friend logic. Then port the rendering into a non-modal panel:

Create `apps/client/src/renderer/src/components/FriendsPane.tsx`:

```tsx
import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { FriendDTO } from "@redvoice/shared";
import { useAuthStore } from "../lib/auth-context.js";
import { ApiClient } from "../lib/api.js";
import { I } from "./Icons.js";
import { InviteCreateModal } from "./InviteCreateModal.js";
import { MyInvitesList } from "./MyInvitesList.js";

export function FriendsPane(): ReactElement {
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const token = useAuthStore((s) => s.token);
  const [friends, setFriends] = useState<FriendDTO[]>([]);
  const [addInput, setAddInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const apiFor = useCallback(() => {
    const api = new ApiClient(serverUrl); api.setToken(token); return api;
  }, [serverUrl, token]);

  const refresh = useCallback(async () => {
    try { const r = await apiFor().friends(); setFriends(r.friends); }
    catch (e) { setError(e instanceof Error ? e.message : "failed to load"); }
  }, [apiFor]);

  useEffect(() => { void refresh(); }, [refresh]);

  const sendRequest = async (): Promise<void> => {
    const raw = addInput.trim();
    if (!raw) return;
    setBusy(true); setError(null);
    try {
      const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
      if (looksLikeEmail) {
        await apiFor().friendRequest(raw);
      } else {
        await apiFor().friendRequestByHandle(raw.replace(/^@/, ""));
      }
      setAddInput("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to send");
    } finally { setBusy(false); }
  };

  const accept = async (id: string): Promise<void> => {
    try { await apiFor().friendAccept(id); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "failed"); }
  };
  const reject = async (id: string): Promise<void> => {
    try { await apiFor().friendReject(id); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "failed"); }
  };

  const incoming = friends.filter((f) => f.status === "pending-incoming");
  const outgoing = friends.filter((f) => f.status === "pending-outgoing");
  const accepted = friends.filter((f) => f.status === "accepted");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)", padding: "var(--s-3) var(--s-4)" }}>
      <div>
        <div className="rv-label" style={{ marginBottom: "var(--s-2)" }}>Add a friend</div>
        <div style={{ display: "flex", gap: "var(--s-2)" }}>
          <input
            className="rv-input"
            placeholder="@handle or email"
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void sendRequest(); } }}
            disabled={busy}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="rv-btn"
            data-variant="primary"
            onClick={() => void sendRequest()}
            disabled={busy || !addInput.trim()}
          >
            <I.Plus size={12} />
          </button>
        </div>
        <button
          type="button"
          className="rv-btn"
          data-variant="ghost"
          onClick={() => setInviteOpen(true)}
          style={{ marginTop: "var(--s-2)", width: "100%", fontSize: "var(--t-xs)" }}
        >
          Or generate an invite link
        </button>
        <InviteCreateModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      </div>

      {error && <div style={{ color: "var(--accent)", fontSize: "var(--t-sm)" }}>{error}</div>}

      {incoming.length > 0 && (
        <section>
          <div className="rv-label" style={{ marginBottom: "var(--s-2)" }}>Pending — incoming</div>
          {incoming.map((f) => (
            <div key={f.friendshipId} style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", padding: "var(--s-2) 0", fontSize: "var(--t-sm)" }}>
              <span style={{ flex: 1 }}>{f.user.displayName}</span>
              <button className="rv-btn" data-variant="primary" style={{ height: "1.7rem", fontSize: "var(--t-xs)" }} onClick={() => void accept(f.friendshipId)}>Accept</button>
              <button className="rv-btn" data-variant="ghost" style={{ height: "1.7rem", fontSize: "var(--t-xs)" }} onClick={() => void reject(f.friendshipId)}>Decline</button>
            </div>
          ))}
        </section>
      )}

      {accepted.length > 0 && (
        <section>
          <div className="rv-label" style={{ marginBottom: "var(--s-2)" }}>Friends ({accepted.length})</div>
          {accepted.map((f) => (
            <div key={f.friendshipId} style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", padding: "var(--s-2) 0", fontSize: "var(--t-sm)" }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: f.isOnline ? "var(--rv-live)" : "var(--text-faint)",
              }} />
              <span style={{ flex: 1 }}>{f.user.displayName}</span>
            </div>
          ))}
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <div className="rv-label" style={{ marginBottom: "var(--s-2)" }}>Pending — sent</div>
          {outgoing.map((f) => (
            <div key={f.friendshipId} style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", padding: "var(--s-2) 0", fontSize: "var(--t-sm)" }}>
              <span style={{ flex: 1, color: "var(--text-faint)" }}>{f.user.displayName}</span>
              <button className="rv-btn" data-variant="ghost" style={{ height: "1.7rem", fontSize: "var(--t-xs)" }} onClick={() => void reject(f.friendshipId)}>Cancel</button>
            </div>
          ))}
        </section>
      )}

      <section>
        <div className="rv-label" style={{ marginBottom: "var(--s-2)" }}>My invites</div>
        <MyInvitesList />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Mount in `DmsScreen`**

In `apps/client/src/renderer/src/screens/DmsScreen.tsx`, add a collapsible Friends section below the thread list. Use a Zustand-free local-state toggle:

```tsx
import { FriendsPane } from "../components/FriendsPane.js";
// ... inside the component:
const [friendsOpen, setFriendsOpen] = useState(false);

// Inside the <aside>, after the thread list scroll container:
<div style={{ borderTop: "1px solid var(--border-soft)" }}>
  <button
    type="button"
    onClick={() => setFriendsOpen((v) => !v)}
    style={{
      width: "100%",
      padding: "var(--s-3) var(--s-4)",
      background: "transparent",
      border: 0,
      color: "var(--text)",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "var(--s-2)",
      fontWeight: 500,
    }}
  >
    Friends {friendsOpen ? "▾" : "▸"}
  </button>
  {friendsOpen && <FriendsPane />}
</div>
```

- [ ] **Step 3: Typecheck + tests**

```bash
pnpm --filter @redvoice/client typecheck
pnpm --filter @redvoice/client test
```

Expected: clean. Tests still 26/26 (no new tests added at this step).

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/renderer/src/components/FriendsPane.tsx apps/client/src/renderer/src/screens/DmsScreen.tsx
git commit -m "$(cat <<'EOF'
feat(client): FriendsPane embedded in DmsScreen left rail

Friends management — friend list, pending requests, add-by-handle/email,
invite-link generator, My Invites — moves out of the standalone modal into
a collapsible panel below the DM thread list. Same logic, same APIs;
different mount.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `LeftIconColumn` + `UserPanelPopover`

**Files:**
- Create: `apps/client/src/renderer/src/components/LeftIconColumn.tsx`
- Create: `apps/client/src/renderer/src/components/UserPanelPopover.tsx`

The icon column owns app-wide identity (avatar, settings, logout). Lives outside the routed content as a permanent left sibling.

- [ ] **Step 1: UserPanelPopover**

Create `apps/client/src/renderer/src/components/UserPanelPopover.tsx`:

```tsx
import { type ReactElement } from "react";
import { I } from "./Icons.js";

type Props = {
  open: boolean;
  onClose(): void;
  displayName: string;
  handle: string | null;
  onOpenSettings(): void;
  onLogout(): void;
};

export function UserPanelPopover({ open, onClose, displayName, handle, onOpenSettings, onLogout }: Props): ReactElement | null {
  if (!open) return null;
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 60, background: "transparent" }}
      />
      <div
        style={{
          position: "absolute",
          left: "100%",
          bottom: 0,
          marginLeft: 8,
          minWidth: 240,
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          boxShadow: "var(--shadow-2)",
          zIndex: 61,
          padding: "var(--s-3)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-2)",
        }}
      >
        <div style={{ padding: "var(--s-2) var(--s-3)" }}>
          <div style={{ fontWeight: 600 }}>{displayName}</div>
          {handle && <div style={{ color: "var(--text-faint)", fontSize: "var(--t-sm)" }}>@{handle}</div>}
        </div>
        <hr className="rv-rule" />
        <button
          type="button"
          className="rv-btn"
          data-variant="ghost"
          onClick={() => { onOpenSettings(); onClose(); }}
          style={{ justifyContent: "flex-start", width: "100%" }}
        >
          <I.Settings size={14} /> Settings
        </button>
        <button
          type="button"
          className="rv-btn"
          data-variant="ghost"
          onClick={() => { onLogout(); onClose(); }}
          style={{ justifyContent: "flex-start", width: "100%" }}
        >
          <I.Logout size={14} /> Log out
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: LeftIconColumn**

Create `apps/client/src/renderer/src/components/LeftIconColumn.tsx`:

```tsx
import { useState, type ReactElement, type ReactNode } from "react";
import { useAuthStore } from "../lib/auth-context.js";
import { I } from "./Icons.js";
import { UserPanelPopover } from "./UserPanelPopover.js";

export type TopPage = "lobby" | "dms";

type Props = {
  active: TopPage;
  onNavigate(page: TopPage): void;
  onOpenSettings(): void;
};

function NavIcon({
  active,
  onClick,
  ariaLabel,
  children,
}: {
  active: boolean;
  onClick(): void;
  ariaLabel: string;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onClick}
      style={{
        width: 40, height: 40,
        display: "grid", placeItems: "center",
        borderRadius: "var(--r-md)",
        background: active ? "color-mix(in oklch, var(--accent) 22%, transparent)" : "transparent",
        border: active ? "1px solid var(--accent)" : "1px solid transparent",
        color: active ? "var(--accent)" : "var(--text-mid)",
        cursor: "pointer",
        transition: "background var(--d-fast), color var(--d-fast)",
      }}
    >
      {children}
    </button>
  );
}

export function LeftIconColumn({ active, onNavigate, onOpenSettings }: Props): ReactElement {
  const me = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [userPanelOpen, setUserPanelOpen] = useState(false);

  return (
    <nav
      style={{
        width: 48,
        flexShrink: 0,
        background: "var(--bg)",
        borderRight: "1px solid var(--border-soft)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "var(--s-3) 0",
        gap: "var(--s-2)",
      }}
    >
      <I.Logo size={22} />
      <div style={{ height: "var(--s-3)" }} />
      <NavIcon active={active === "lobby"} onClick={() => onNavigate("lobby")} ariaLabel="Lobby">
        <I.Logo size={16} />
      </NavIcon>
      <NavIcon active={active === "dms"} onClick={() => onNavigate("dms")} ariaLabel="Direct messages">
        <I.Chat size={16} />
      </NavIcon>

      <div style={{ flex: 1 }} />

      {me && (
        <div style={{ position: "relative" }}>
          <button
            type="button"
            aria-label="Your account"
            title={me.handle ? `@${me.handle}` : me.displayName}
            onClick={() => setUserPanelOpen((v) => !v)}
            style={{
              width: 36, height: 36,
              borderRadius: "50%",
              border: "1px solid var(--border)",
              background: "var(--bg-elev)",
              cursor: "pointer",
              padding: 0,
              display: "grid", placeItems: "center",
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            {(me.displayName?.charAt(0) ?? "?").toUpperCase()}
          </button>
          <UserPanelPopover
            open={userPanelOpen}
            onClose={() => setUserPanelOpen(false)}
            displayName={me.displayName ?? "(you)"}
            handle={me.handle ?? null}
            onOpenSettings={onOpenSettings}
            onLogout={() => void logout()}
          />
        </div>
      )}
    </nav>
  );
}
```

If `I.Logo` and `I.Chat` aren't both exported by `Icons.tsx`, check the actual exports and pick valid replacements (`I.Home` if it exists, otherwise mirror what LobbyScreen uses today). The icons are visual and easy to swap.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @redvoice/client typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/renderer/src/components/LeftIconColumn.tsx apps/client/src/renderer/src/components/UserPanelPopover.tsx
git commit -m "$(cat <<'EOF'
feat(client): LeftIconColumn nav + UserPanelPopover

48px persistent nav column hosting Lobby + DMs icons and a bottom-anchored
user panel (avatar → click for displayName, @handle, Settings, Logout).
Doesn't yet mount in App.tsx — that's the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Wire `LeftIconColumn` + `DmsScreen` into App.tsx

**Files:**
- Modify: `apps/client/src/renderer/src/App.tsx`

Add `topPage` state, render the icon column as a permanent left sibling of the routed content, and switch which screen renders based on `topPage`.

- [ ] **Step 1: Modify App.tsx Router function**

Find the `Router` function in `App.tsx`. The current structure: after auth gate + handle gate + invite preview, it returns `<LobbyScreen ... />`. Wrap that in a flex container that includes the icon column, and switch between Lobby and DMs:

```tsx
import { LeftIconColumn, type TopPage } from "./components/LeftIconColumn.js";
import { DmsScreen } from "./screens/DmsScreen.js";
import { SettingsModal } from "./components/SettingsModal.js";

// inside Router, alongside existing state:
const [topPage, setTopPage] = useState<TopPage>("lobby");
const [settingsOpen, setSettingsOpen] = useState(false);

// Replace the final `return <LobbyScreen ... />` with:
return (
  <div style={{ display: "flex", height: "100%" }}>
    <LeftIconColumn
      active={topPage}
      onNavigate={setTopPage}
      onOpenSettings={() => setSettingsOpen(true)}
    />
    <div style={{ flex: 1, minWidth: 0 }}>
      {topPage === "lobby" ? (
        <LobbyScreen
          pendingInviteCode={pendingInviteCode}
          onInviteCodeConsumed={() => { setPendingInviteCode(null); /* clear ?invite= */ }}
          onInviteCode={setPendingInviteCode}
        />
      ) : (
        <DmsScreen />
      )}
    </div>
    <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
  </div>
);
```

Preserve whatever query-param cleanup logic the existing `onInviteCodeConsumed` already does — match the current code there.

- [ ] **Step 2: Typecheck + tests**

```bash
pnpm --filter @redvoice/client typecheck
pnpm --filter @redvoice/client test
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/renderer/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(client): mount LeftIconColumn + route between Lobby and DmsScreen

Authed routes now render inside a flex container with the icon column on
the left and the active page (Lobby or DMs) on the right. Settings opens
as a modal from the user-panel popover at the bottom of the column.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Lobby top-bar surgery + delete dead modals

**Files:**
- Modify: `apps/client/src/renderer/src/screens/LobbyScreen.tsx`
- Delete: `apps/client/src/renderer/src/components/DmInboxModal.tsx`
- Delete: `apps/client/src/renderer/src/components/FriendsModal.tsx`

Now that the icon column owns app identity (avatar, logout, settings) and DMs/Friends live in DmsScreen, the lobby's top bar collapses dramatically.

- [ ] **Step 1: Remove top-bar controls from LobbyScreen**

In `apps/client/src/renderer/src/screens/LobbyScreen.tsx`:
- Remove imports of `FriendsModal`, `DmInboxModal`, `SettingsModal`, `FeaturesPanel` (the latter is the Changelog modal).
- Remove the corresponding `useState` lines: `friendsOpen`, `dmInboxOpen`, `settingsOpen`, `featuresOpen`.
- Remove the entire `<header>` block that spans (in current code) roughly lines 263–330. This block currently holds: Logo + "RedVoice" wordmark, connected pill, avatar+displayName card, Friends button, DMs button, Changelog button, Settings button, Logout button.
- Replace that block with a much smaller header containing ONLY the connected pill (right-aligned), or no header at all — the icon column owns identity now.

Suggested replacement:

```tsx
<header
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: "var(--s-3) var(--s-6)",
    borderBottom: "1px solid var(--border-soft)",
  }}
>
  <span
    className="rv-badge"
    data-tone={online === "ok" ? "live" : online === "down" ? "red" : "amber"}
  >
    <span className="pip" />{" "}
    {online === "checking" ? "connecting…" : online === "ok" ? "connected" : "offline"}
  </span>
</header>
```

- Remove the Modal mount lines at the bottom of the component (`<FriendsModal …/>`, `<DmInboxModal …/>`, `<SettingsModal …/>`, `<FeaturesPanel …/>`).
- The Changelog (`FeaturesPanel`) doesn't have a new home in this plan. Defer to Plan 4 (UI/UX makeover) — for now, just remove its mount. The component file stays on disk; it's no longer referenced.

- [ ] **Step 2: Delete the dead modals**

```bash
rm apps/client/src/renderer/src/components/DmInboxModal.tsx
rm apps/client/src/renderer/src/components/FriendsModal.tsx
```

- [ ] **Step 3: Verify nothing else references the deleted files**

```bash
grep -rn 'DmInboxModal\|FriendsModal' apps/client/src/
```

Expected: no matches. If any remain, follow them and remove the dead imports/mounts.

- [ ] **Step 4: Typecheck + tests**

```bash
pnpm --filter @redvoice/client typecheck
pnpm --filter @redvoice/client test
```

Both clean. Tests still 26.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/renderer/src/screens/LobbyScreen.tsx apps/client/src/renderer/src/components/DmInboxModal.tsx apps/client/src/renderer/src/components/FriendsModal.tsx
git commit -m "$(cat <<'EOF'
feat(client): collapse lobby top bar; delete DmInboxModal + FriendsModal

Lobby's top bar drops from 9 controls (Logo + wordmark + connected pill +
avatar card + Friends + DMs + Changelog + Settings + Logout) to 1 (just
the connected pill). Identity, settings, logout, and DM/Friends nav all
live in the LeftIconColumn now. The two modals are deleted; their
contents moved to FriendsPane (in DmsScreen) in earlier tasks.

The Changelog (FeaturesPanel) loses its mount point — to be re-homed as
part of the broader UI/UX makeover (sub-project #4). The component file
remains on disk for that future use.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Final integration tests + version bump

**Files:**
- Modify: `apps/client/tests/api.test.ts` (add a test for the new `dmThreads` shape)
- Modify: `apps/client/package.json`, `apps/server/package.json`, `package.json` (version 0.7.0)

- [ ] **Step 1: Add an api.test.ts mock for dmThreads new shape**

Append to `apps/client/tests/api.test.ts`:

```ts
it("dmThreads decodes otherParticipant correctly", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    threads: [{
      threadId: "aaa:bbb",
      lastMessage: {
        id: "m1", threadType: "dm", threadId: "aaa:bbb",
        authorId: "aaa", authorName: "Alice", body: "hi",
        createdAt: "2026-04-30T00:00:00Z", editedAt: null, deletedAt: null,
      },
      otherParticipant: { id: "bbb", handle: "bob", displayName: "Bob" },
    }],
  }), { status: 200 }));
  globalThis.fetch = fetchMock;
  const api = new ApiClient("http://localhost:3000");
  api.setToken("tok");
  const r = await api.dmThreads();
  expect(r.threads[0].otherParticipant).toMatchObject({ id: "bbb", handle: "bob" });
});
```

If the test file uses a different fetch-mock pattern, mirror what's already there.

- [ ] **Step 2: Run client tests**

```bash
pnpm --filter @redvoice/client test
```

Expected: 27 pass.

- [ ] **Step 3: Run server suite**

```bash
pnpm --filter @redvoice/server test
```

Expected: 2 pre-existing failures only (rooms.test.ts non-owner case + token.test.ts membership-on-first-token), plus the new dm-threads test passes. Total ≈ 95 pass / 2 fail.

- [ ] **Step 4: Bump versions**

```bash
sed -i 's/"version": "0.6.0"/"version": "0.7.0"/' apps/client/package.json apps/server/package.json package.json
```

- [ ] **Step 5: Commit**

```bash
git add apps/client/tests/api.test.ts apps/client/package.json apps/server/package.json package.json
git commit -m "$(cat <<'EOF'
feat: DMs page + lobby cleanup end-to-end (v0.7.0)

End of Plan 2 — DMs are a real top-level page reachable via a left icon
column; lobby's top bar holds one control (connected pill) instead of
nine; FriendsModal + DmInboxModal are deleted. Discord users will land
in this and feel oriented inside 30 seconds.

Notifications, mentions, and the broader UI/UX makeover are non-goals
for this version (Plans 3 and 4).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Tag**

```bash
git tag v0.7.0 -m "v0.7.0 — DMs page + lobby cleanup"
```

Don't push the tag until the user has reviewed the local commit chain.

---

## Self-Review

| Spec section | Plan task(s) | Notes |
|---|---|---|
| Q5 — DM page as separate top-level | Tasks 5, 8 | DmsScreen + App.tsx routing |
| § "Lobby cleanup (incidental)" | Task 9 | Top bar 9→1 |
| § "DMs page" — left rail thread list | Tasks 3, 5 | DmThreadList component |
| § "DMs page" — center conversation pane | Task 5 | Reuses RoomChatPanel (threadType="dm") |
| § "+ New" handle picker | Task 4 | NewDmPicker |
| § "Friends ▸ sub-pane" | Task 6 | FriendsPane embedded |
| § "DMs page" — empty state | Task 5 | Center-pane empty state |
| § "Icon column 🏠 + 💬" | Task 7 | LeftIconColumn |
| § "Settings/Logout move to bottom of icon column" | Tasks 7, 8 | UserPanelPopover hosts both |
| § "User-panel-style identity" (added on user feedback) | Task 7 | UserPanelPopover popover |
| § "Other-participant identity in DM thread list" (bug spotted in audit) | Task 1 | Server route + DTO |
| Out-of-scope: notifications, mentions, search, bottom-left always-visible mic/deafen | (none) | Plan 3 / future |
| Out-of-scope: composer @-autocomplete | (none) | Plan 3 |
| Out-of-scope: Changelog re-home | (none) | Plan 4 — file stays on disk |

**Coverage gap fixed during this review:** added Task 10 step 1 (test for the new `dmThreads` shape) so the client-side decoding is regression-tested.

**Type / signature consistency:** `DmThreadEntry`, `TopPage`, `dmThreadId(a,b)`, `otherParticipantId(threadId,callerId)`, `RoomChatPanel({ threadType, threadId })`, `LeftIconColumn({ active, onNavigate, onOpenSettings })` — all match across tasks.

**Placeholder scan:** no TBDs, no "implement later", every code block contains real code.

**Scope:** plan covers a single coherent slice — DMs surfacing + lobby cleanup. Notifications, mentions, full UI redesign explicitly deferred. ✓

---

## Execution Notes

- Tasks 1–4 are isolated leaf-level work. Tasks 5–9 are progressively-integrating UI changes. Task 10 is finalize.
- After Task 8, you'll have BOTH the new icon column AND the old lobby top bar simultaneously — the icon column will show next to a lobby that still has all nine controls. Visually ugly, but the app keeps working. Task 9 cleans this up. **Do not commit Task 8 and immediately push without doing Task 9.**
- The Changelog (`FeaturesPanel`) loses its current mount in Task 9. Users won't have a way to view the changelog after this plan ships. Plan 4 (UI/UX makeover) is responsible for re-homing it (likely in Settings → About). Acceptable transient regression.
- 10 tasks, one commit each. v0.7.0 tag at the end.
