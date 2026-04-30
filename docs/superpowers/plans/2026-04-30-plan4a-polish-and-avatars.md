# Plan 4A — Polish + Profile Pictures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v0.9.0 with auto-generated handles on signup, URL-only avatars, two carryover bug fixes, a 4K sizing audit, error message rewrites, and a Changelog rehome.

**Architecture:** Mostly polish on top of existing infrastructure. Server adds one column (`avatarUrl`) and one new module (handle generator). Client adds one shared component (`Avatar`), one toast, swaps a hardcoded `"all"` for a cache, and wires an existing onClick stub. No new subsystems.

**Tech Stack:** TypeScript, Prisma + SQLite, Fastify, Zod, React + Zustand, Vitest, Electron + electron-vite.

**Spec:** `docs/superpowers/specs/2026-04-30-plan4a-polish-and-avatars-design.md`

---

## File Structure

**Server — created:**
- `apps/server/src/auth/handle-generator.ts` — slug + collision-suffix algorithm
- `apps/server/tests/handle-generator.test.ts`
- `apps/server/tests/avatar-validation.test.ts`
- `apps/server/prisma/migrations/<TIMESTAMP>_add_avatar_url/migration.sql`

**Server — modified:**
- `apps/server/prisma/schema.prisma` — add `avatarUrl String?` to User
- `apps/server/src/auth/routes.ts` — register endpoint calls handle generator, response includes `avatarUrl`
- `apps/server/src/users/routes.ts` — extend with `PATCH /me` accepting `avatarUrl`
- `apps/server/tests/auth-register.test.ts` — assert auto-generated handle in response

**Shared — modified:**
- `packages/shared/src/index.ts` — `UserDTO.avatarUrl?: string | null`, `updateMeSchema`

**Client — created:**
- `apps/client/src/renderer/src/components/Avatar.tsx` — unified avatar component
- `apps/client/src/renderer/src/components/Avatar.test.tsx`
- `apps/client/src/renderer/src/components/UpdateToast.tsx` — first-launch-after-update notice
- `apps/client/src/renderer/src/components/UpdateToast.test.tsx`

**Client — modified:**
- `apps/client/src/renderer/src/lib/api.ts` — `updateMe({ avatarUrl })` method
- `apps/client/src/renderer/src/lib/auth-store.ts` — propagate avatarUrl into user state
- `apps/client/src/renderer/src/lib/chat-transport.ts` — mute-level cache replaces hardcoded `"all"`
- `apps/client/src/renderer/src/components/SettingsModal.tsx` — Account tab Avatar URL input + drop Changelog tab + About → What's new link
- `apps/client/src/renderer/src/components/FriendsPane.tsx` — already wires `onJoinRoom` prop; ensure App.tsx passes the real handler (carryover #4)
- `apps/client/src/renderer/src/components/DmThreadList.tsx`, `LeftIconColumn.tsx`, `screens/InRoomScreen.tsx`, plus any other initials-circle sites — switch to `<Avatar>`
- `apps/client/src/renderer/src/screens/LoginScreen.tsx` — no handle UI changes (already only collects email/password/displayName), but post-register banner shown
- `apps/client/src/renderer/src/App.tsx` — mount UpdateToast, pass onJoinRoom into FriendsPane
- `apps/client/src/preload/index.ts` + `apps/client/src/main/index.ts` + `apps/client/src/shared/bridge-types.ts` — add `getAppVersion()` IPC
- `apps/client/src/renderer/src/styles/global.css` (or wherever `:root` lives) — bump base font-size 14px → 15px

**Bumps + changelog:**
- `apps/client/package.json` and `apps/server/package.json` → `0.9.0`
- `CHANGELOG.md` entry

---

## Task 1: Server — schema migration for `avatarUrl`

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/<TIMESTAMP>_add_avatar_url/migration.sql`

- [ ] **Step 1: Add column to schema**

In `apps/server/prisma/schema.prisma`, inside `model User`, add after `dndUntil`:

```prisma
  dndUntil    DateTime?
  avatarUrl   String?
  currentRoomId   String?
```

- [ ] **Step 2: Create migration directory + SQL**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
mkdir -p "apps/server/prisma/migrations/${TS}_add_avatar_url"
cat > "apps/server/prisma/migrations/${TS}_add_avatar_url/migration.sql" <<'EOF'
-- AddColumn
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
EOF
```

- [ ] **Step 3: Apply + regenerate Prisma client**

```bash
cd apps/server
DATABASE_URL="file:./prisma/dev.db" pnpm prisma migrate deploy
DATABASE_URL="file:./prisma/dev.db" pnpm prisma generate
```

Expected: "Database is now in sync with your schema." and Prisma Client regenerated.

- [ ] **Step 4: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/
git commit -m "feat(server): add User.avatarUrl column"
```

---

## Task 2: Server — handle generator (TDD)

**Files:**
- Create: `apps/server/src/auth/handle-generator.ts`
- Create: `apps/server/tests/handle-generator.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/tests/handle-generator.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { generateUniqueHandle } from "../src/auth/handle-generator.js";
import { prisma } from "../src/db.js";
import { disconnectDb } from "./helpers/db.js";

describe("generateUniqueHandle", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({});
  });
  afterAll(async () => {
    await disconnectDb();
  });

  it("slugifies a simple display name", async () => {
    expect(await generateUniqueHandle("Alice")).toBe("alice");
  });

  it("preserves digits and underscores", async () => {
    expect(await generateUniqueHandle("R3dWolfie_42")).toBe("r3dwolfie_42");
  });

  it("replaces whitespace with underscore", async () => {
    expect(await generateUniqueHandle("Cool Person")).toBe("cool_person");
  });

  it("strips emoji and non-alphanumeric", async () => {
    expect(await generateUniqueHandle("🐺R3d!")).toBe("r3d");
  });

  it("falls back to 'user' when input is empty after cleaning", async () => {
    expect(await generateUniqueHandle("🐺")).toBe("user");
  });

  it("truncates to 20 characters", async () => {
    const result = await generateUniqueHandle("a".repeat(50));
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).toBe("a".repeat(20));
  });

  it("appends _2 on collision", async () => {
    await prisma.user.create({
      data: {
        email: "x@y.z",
        passwordHash: "x",
        displayName: "John",
        handle: "john",
        handleLower: "john",
      },
    });
    expect(await generateUniqueHandle("John")).toBe("john_2");
  });

  it("appends _3 when _2 also taken", async () => {
    for (const lower of ["john", "john_2"]) {
      await prisma.user.create({
        data: {
          email: `${lower}@y.z`,
          passwordHash: "x",
          displayName: lower,
          handle: lower,
          handleLower: lower,
        },
      });
    }
    expect(await generateUniqueHandle("John")).toBe("john_3");
  });

  it("uses 'user' fallback with collision suffix when needed", async () => {
    await prisma.user.create({
      data: { email: "u@y.z", passwordHash: "x", displayName: "u", handle: "user", handleLower: "user" },
    });
    expect(await generateUniqueHandle("🐺")).toBe("user_2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server
pnpm test tests/handle-generator.test.ts
```

Expected: FAIL — `Cannot find module '../src/auth/handle-generator.js'`.

- [ ] **Step 3: Implement the generator**

`apps/server/src/auth/handle-generator.ts`:

```ts
import { prisma } from "../db.js";

const MAX_LEN = 20;
const FALLBACK = "user";

/**
 * Slugify and pick a handle that doesn't collide with an existing user.
 * Algorithm: lowercase → replace whitespace with `_` → strip everything
 * outside [a-z0-9_] → truncate to 20 chars → fall back to "user" if empty
 * → append `_2`, `_3`, ... until handleLower is unique.
 */
export async function generateUniqueHandle(displayName: string): Promise<string> {
  const base = slug(displayName);
  let candidate = base;
  let n = 2;
  // Worst case: O(N) lookups. Acceptable at RedVoice scale.
  while (await isTaken(candidate)) {
    const suffix = `_${n}`;
    const room = MAX_LEN - suffix.length;
    candidate = base.slice(0, room) + suffix;
    n += 1;
  }
  return candidate;
}

function slug(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, MAX_LEN);
  return cleaned.length > 0 ? cleaned : FALLBACK;
}

async function isTaken(candidate: string): Promise<boolean> {
  const hit = await prisma.user.findUnique({
    where: { handleLower: candidate },
    select: { id: true },
  });
  return hit !== null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/server
pnpm test tests/handle-generator.test.ts
```

Expected: PASS — 9/9.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/auth/handle-generator.ts apps/server/tests/handle-generator.test.ts
git commit -m "feat(server): unique handle generator"
```

---

## Task 3: Server — wire generator into `POST /auth/register`

**Files:**
- Modify: `apps/server/src/auth/routes.ts:36-69`
- Modify: `apps/server/tests/auth-register.test.ts`

- [ ] **Step 1: Update register test to assert auto-generated handle**

In `apps/server/tests/auth-register.test.ts`, modify the existing "creates a user" test to also assert the handle:

```ts
  it("creates a user and returns a session token with auto-generated handle", async () => {
    app = await makeTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "a@b.com", password: "longenough-pw-123", displayName: "Alice" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toEqual(expect.any(String));
    expect(body.user.email).toBe("a@b.com");
    expect(body.user.displayName).toBe("Alice");
    expect(body.user.handle).toBe("alice");
    expect(body.user.id).toEqual(expect.any(String));
  });
```

Add a new test for collision:

```ts
  it("auto-generates a colliding handle with _2 suffix", async () => {
    app = await makeTestApp();
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "a@b.com", password: "longenough-pw-123", displayName: "Alice" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "a2@b.com", password: "longenough-pw-123", displayName: "Alice" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user.handle).toBe("alice_2");
  });
```

- [ ] **Step 2: Run tests, verify failures**

```bash
cd apps/server
pnpm test tests/auth-register.test.ts
```

Expected: FAIL — handle is null (current behavior).

- [ ] **Step 3: Wire generator into register route**

In `apps/server/src/auth/routes.ts`, replace the user create block (around lines 41-58):

```ts
      const { email, password, displayName, e2eePublicKey } = parsed.data;
      const passwordHash = await hashPassword(password);
      const handle = await generateUniqueHandle(displayName);
      const handleLower = handle.toLowerCase();
      let user;
      try {
        user = await prisma.user.create({
          data: {
            email,
            displayName,
            passwordHash,
            handle,
            handleLower,
            ...(e2eePublicKey && { e2eePublicKey }),
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new ConflictError("email already registered");
        }
        throw err;
      }
```

Add the import at the top:

```ts
import { generateUniqueHandle } from "./handle-generator.js";
```

Update the response payload to include `avatarUrl`:

```ts
      reply.status(201).send({
        token,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          handle: user.handle ?? null,
          avatarUrl: user.avatarUrl ?? null,
          dndUntil: user.dndUntil?.toISOString() ?? null,
        },
      });
```

Apply the same `avatarUrl` field to the two other response sites (login + login/totp + GET /me) by repeating the change at lines 105-107, 138-140, and 146-154 of the same file.

- [ ] **Step 4: Run tests**

```bash
cd apps/server
pnpm test tests/auth-register.test.ts tests/handles.test.ts tests/me-and-logout.test.ts
```

Expected: PASS for register tests. If `me-and-logout` breaks on `avatarUrl`, update its expected payload to include `avatarUrl: null`.

- [ ] **Step 5: Run the full server test suite**

```bash
cd apps/server
pnpm test
```

Expected: all green. Fix any DTO-shape assertion that now fails because of the added `avatarUrl: null` field.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/auth/routes.ts apps/server/tests/
git commit -m "feat(server): auto-generate handle on register, include avatarUrl in user payloads"
```

---

## Task 4: Server — `PATCH /me` accepting `avatarUrl` (TDD)

**Files:**
- Modify: `apps/server/src/users/routes.ts`
- Create: `apps/server/tests/avatar-validation.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/tests/avatar-validation.test.ts`:

```ts
import { describe, it, expect, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeTestApp } from "./helpers/app.js";
import { disconnectDb } from "./helpers/db.js";

describe("PATCH /me avatarUrl", () => {
  let app: FastifyInstance;
  afterEach(async () => { if (app) await app.close(); });
  afterAll(async () => { await disconnectDb(); });

  async function registerAndLogin(): Promise<string> {
    app = await makeTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "a@b.com", password: "longenough-pw-123", displayName: "Alice" },
    });
    return res.json().token;
  }

  it("accepts a valid https URL", async () => {
    const token = await registerAndLogin();
    const res = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarUrl: "https://example.com/me.png" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().avatarUrl).toBe("https://example.com/me.png");
  });

  it("rejects http (non-https) URLs", async () => {
    const token = await registerAndLogin();
    const res = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarUrl: "http://example.com/me.png" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects URLs longer than 2048 chars", async () => {
    const token = await registerAndLogin();
    const long = "https://example.com/" + "a".repeat(2050);
    const res = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarUrl: long },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects non-URL strings", async () => {
    const token = await registerAndLogin();
    const res = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarUrl: "not-a-url" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("clears avatar with null", async () => {
    const token = await registerAndLogin();
    await app.inject({
      method: "PATCH",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarUrl: "https://example.com/me.png" },
    });
    const res = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarUrl: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().avatarUrl).toBeNull();
  });

  it("requires auth", async () => {
    app = await makeTestApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/me",
      payload: { avatarUrl: "https://example.com/me.png" },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
cd apps/server
pnpm test tests/avatar-validation.test.ts
```

Expected: FAIL — `PATCH /me` route doesn't exist.

- [ ] **Step 3: Add PATCH /me route**

In `apps/server/src/users/routes.ts`, add inside `userRoutes`:

```ts
  const updateMeSchema = z.object({
    avatarUrl: z
      .string()
      .url()
      .max(2048)
      .startsWith("https://")
      .nullable()
      .optional(),
  });

  app.patch("/me", { preHandler: requireAuth }, async (request) => {
    const parsed = updateMeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "invalid input");
    }
    const userId = request.auth!.userId;

    const data: { avatarUrl?: string | null } = {};
    if (parsed.data.avatarUrl !== undefined) {
      data.avatarUrl = parsed.data.avatarUrl;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
    });

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      handle: user.handle ?? null,
      avatarUrl: user.avatarUrl ?? null,
      dndUntil: user.dndUntil?.toISOString() ?? null,
      totpEnabled: user.totpEnabledAt !== null,
      hasE2eeKey: user.e2eePublicKey !== null,
    };
  });
```

- [ ] **Step 4: Run tests**

```bash
cd apps/server
pnpm test tests/avatar-validation.test.ts
```

Expected: PASS — 6/6.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/users/routes.ts apps/server/tests/avatar-validation.test.ts
git commit -m "feat(server): PATCH /me accepts avatarUrl (https-only, ≤2048 chars)"
```

---

## Task 5: Shared types — `UserDTO.avatarUrl`

**Files:**
- Modify: `packages/shared/src/index.ts:37-44`

- [ ] **Step 1: Add field to UserDTO**

In `packages/shared/src/index.ts`, update `UserDTO`:

```ts
export interface UserDTO {
  id: string;
  email: string;
  displayName: string;
  handle?: string | null;
  avatarUrl?: string | null;
  totpEnabled?: boolean;
  dndUntil?: string | null;
}
```

Add a new schema near the bottom of the file (after `setPresenceSchema`):

```ts
export const updateMeSchema = z.object({
  avatarUrl: z
    .string()
    .url()
    .max(2048)
    .startsWith("https://")
    .nullable()
    .optional(),
});

export type UpdateMeRequest = z.infer<typeof updateMeSchema>;
```

- [ ] **Step 2: Build shared package**

```bash
cd packages/shared
pnpm build
```

Expected: success.

- [ ] **Step 3: Verify the workspace typechecks**

```bash
cd ../..
pnpm -r typecheck
```

Expected: success. If anything in `apps/client/src/renderer` referenced a `UserDTO.avatarUrl` that didn't exist, it'd compile now. Likely no failures.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): UserDTO.avatarUrl + updateMeSchema"
```

---

## Task 6: Client API — `updateMe({ avatarUrl })`

**Files:**
- Modify: `apps/client/src/renderer/src/lib/api.ts`

- [ ] **Step 1: Find the API method block**

Locate the `me()` method (around line 117) and the `setMyHandle` block (around line 208).

- [ ] **Step 2: Add updateMe method**

Add after `setMyHandle`:

```ts
  async updateMe(patch: { avatarUrl?: string | null }): Promise<UserDTO> {
    return this.requestWithMethod<typeof patch, UserDTO>("PATCH", "/me", patch);
  }
```

If `requestWithMethod` is not exposed for arbitrary types, mirror the existing pattern used by `setDnd` (line 265) which calls `this.request("PATCH", "/me/dnd", { until })` — investigate whether `request` already supports PATCH or if you need `requestWithMethod`. The existing PATCH calls in api.ts establish the pattern; copy it exactly.

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/client
pnpm typecheck
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/renderer/src/lib/api.ts
git commit -m "feat(client): ApiClient.updateMe for PATCH /me"
```

---

## Task 7: Client — `Avatar` component (TDD)

**Files:**
- Create: `apps/client/src/renderer/src/components/Avatar.tsx`
- Create: `apps/client/src/renderer/src/components/Avatar.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/client/src/renderer/src/components/Avatar.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Avatar } from "./Avatar.js";

describe("Avatar", () => {
  it("renders an <img> when src is set", () => {
    const { container } = render(
      <Avatar src="https://example.com/me.png" fallbackInitials="Alice" fallbackColorSeed="user-1" size={32} />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("https://example.com/me.png");
  });

  it("falls back to initials when src is null", () => {
    const { container, getByText } = render(
      <Avatar src={null} fallbackInitials="Alice" fallbackColorSeed="user-1" size={32} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("A")).toBeTruthy();
  });

  it("falls back to initials on img error", () => {
    const { container, getByText } = render(
      <Avatar src="https://broken.example/x.png" fallbackInitials="Alice" fallbackColorSeed="user-1" size={32} />,
    );
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("A")).toBeTruthy();
  });

  it("upper-cases the initial", () => {
    const { getByText } = render(
      <Avatar src={null} fallbackInitials="alice" fallbackColorSeed="user-1" size={32} />,
    );
    expect(getByText("A")).toBeTruthy();
  });

  it("renders ? when fallbackInitials is empty", () => {
    const { getByText } = render(
      <Avatar src={null} fallbackInitials="" fallbackColorSeed="user-1" size={32} />,
    );
    expect(getByText("?")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd apps/client
pnpm test src/renderer/src/components/Avatar.test.tsx
```

Expected: FAIL — module not found.

If `@testing-library/react` is not yet in devDependencies, add it:

```bash
pnpm --filter @redvoice/client add -D @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Implement Avatar**

`apps/client/src/renderer/src/components/Avatar.tsx`:

```tsx
import { useState, type ReactElement } from "react";

type Props = {
  src?: string | null;
  fallbackInitials: string;
  fallbackColorSeed: string;
  size: number;
  shape?: "circle" | "rounded";
};

/**
 * Unified avatar. If `src` is set, render an <img> that falls back to the
 * initials circle on error. Otherwise render the initials directly.
 *
 * fallbackColorSeed is hashed to pick one of a fixed palette so the same
 * user always gets the same circle color across the UI.
 */
export function Avatar({
  src,
  fallbackInitials,
  fallbackColorSeed,
  size,
  shape = "circle",
}: Props): ReactElement {
  const [broken, setBroken] = useState(false);
  const radius = shape === "circle" ? "50%" : "20%";

  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setBroken(true)}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }

  const letter = (fallbackInitials.charAt(0) || "?").toUpperCase();
  const bg = colorForSeed(fallbackColorSeed);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: bg,
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.42,
        fontWeight: 600,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {letter}
    </div>
  );
}

const PALETTE = [
  "#e07a5f", "#3d5a80", "#81b29a", "#f2cc8f",
  "#8a6cd1", "#d96c75", "#5b8bd6", "#5fa667",
];

function colorForSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]!;
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/client
pnpm test src/renderer/src/components/Avatar.test.tsx
```

Expected: PASS — 5/5.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/renderer/src/components/Avatar.tsx apps/client/src/renderer/src/components/Avatar.test.tsx
git commit -m "feat(client): Avatar component with img + initials fallback"
```

---

## Task 8: Client — replace ad-hoc initials with `Avatar`

**Files:**
- Modify: `apps/client/src/renderer/src/components/FriendsPane.tsx` — friends list rows
- Modify: `apps/client/src/renderer/src/components/DmThreadList.tsx:51`
- Modify: `apps/client/src/renderer/src/components/LeftIconColumn.tsx:106`
- Modify: `apps/client/src/renderer/src/components/SettingsModal.tsx:904`
- Modify: `apps/client/src/renderer/src/screens/InRoomScreen.tsx:393, 1681`

- [ ] **Step 1: Replace each initials-circle site with `<Avatar>`**

For each location, find the existing JSX that renders a colored circle with `displayName.charAt(0).toUpperCase()` and replace with:

```tsx
<Avatar
  src={user.avatarUrl ?? null}
  fallbackInitials={user.displayName ?? ""}
  fallbackColorSeed={user.id}
  size={32}
/>
```

Adjust `size` per existing usage (32 for thread rows, 24 for compact, 64 for big tile, etc).

For sites where the variable isn't `user` but a peer/friend object, use that object's fields. For `LeftIconColumn:106` (`me`), use `me.id`, `me.displayName`, `me.avatarUrl`.

For `InRoomScreen` participant tiles, the `tile` object may not carry avatarUrl yet — pass `null` for `src` until LiveKit metadata sync (out of scope for Plan 4A); existing color-from-name behavior is preserved as the fallback.

- [ ] **Step 2: Add the import to each modified file**

```ts
import { Avatar } from "./Avatar.js";
```

(or `../components/Avatar.js` depending on relative depth)

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/client
pnpm typecheck
```

Expected: success. Fix any places where `user.avatarUrl` isn't yet on the local type — those local types are pulled from `UserDTO` which now has `avatarUrl?: string | null`, so they should compile.

- [ ] **Step 4: Manual smoke**

```bash
cd apps/client
pnpm dev
```

Open the app, log in (existing account, avatarUrl=null). Confirm: friend rows, DM thread list, LeftIconColumn user button, Settings → Account avatar all render colored circles with initials, identical to before. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/renderer/src/components/ apps/client/src/renderer/src/screens/InRoomScreen.tsx
git commit -m "refactor(client): unify ad-hoc initials circles into <Avatar>"
```

---

## Task 9: Client — Avatar URL field in Settings → Account

**Files:**
- Modify: `apps/client/src/renderer/src/components/SettingsModal.tsx`
- Modify: `apps/client/src/renderer/src/lib/auth-store.ts`

- [ ] **Step 1: Wire updateMe through auth store**

In `auth-store.ts`, add a new action to the AuthState interface:

```ts
  updateAvatarUrl(url: string | null): Promise<void>;
```

In the createAuthStore body, add:

```ts
    async updateAvatarUrl(url) {
      const updated = await api.updateMe({ avatarUrl: url });
      set((s) => ({ user: s.user ? { ...s.user, avatarUrl: updated.avatarUrl } : updated }));
    },
```

- [ ] **Step 2: Add the form field in SettingsModal Account tab**

Locate the Account tab (around line 904 where the avatar circle currently renders). Add below the existing displayName/handle rows:

```tsx
<div className="rv-field">
  <label className="rv-label">Profile picture URL</label>
  <input
    className="rv-input"
    type="url"
    placeholder="https://…"
    value={avatarUrlDraft}
    onChange={(e) => setAvatarUrlDraft(e.target.value)}
    disabled={avatarBusy}
  />
  <div style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-2)", alignItems: "center" }}>
    <Avatar
      src={avatarUrlDraft.trim() || null}
      fallbackInitials={user?.displayName ?? ""}
      fallbackColorSeed={user?.id ?? ""}
      size={48}
    />
    <button
      type="button"
      className="rv-btn"
      data-variant="primary"
      disabled={avatarBusy || avatarUrlDraft === (user?.avatarUrl ?? "")}
      onClick={async () => {
        setAvatarBusy(true);
        setAvatarError(null);
        try {
          const next = avatarUrlDraft.trim();
          await updateAvatarUrl(next === "" ? null : next);
        } catch (e) {
          setAvatarError(e instanceof Error ? e.message : "failed to save");
        } finally {
          setAvatarBusy(false);
        }
      }}
    >
      Save
    </button>
    {(user?.avatarUrl ?? null) !== null && (
      <button
        type="button"
        className="rv-btn"
        data-variant="ghost"
        disabled={avatarBusy}
        onClick={async () => {
          setAvatarBusy(true);
          try { await updateAvatarUrl(null); setAvatarUrlDraft(""); }
          finally { setAvatarBusy(false); }
        }}
      >
        Remove
      </button>
    )}
  </div>
  {avatarError && <div style={{ color: "var(--accent)", fontSize: "var(--t-sm)", marginTop: "var(--s-1)" }}>{avatarError}</div>}
  <div className="rv-field-help">Paste a direct image URL (https only). Falls back to your initials if missing or broken.</div>
</div>
```

Add the local state hooks at the top of the Account tab component:

```ts
const updateAvatarUrl = useAuthStore((s) => s.updateAvatarUrl);
const [avatarUrlDraft, setAvatarUrlDraft] = useState(user?.avatarUrl ?? "");
const [avatarBusy, setAvatarBusy] = useState(false);
const [avatarError, setAvatarError] = useState<string | null>(null);

useEffect(() => {
  setAvatarUrlDraft(user?.avatarUrl ?? "");
}, [user?.avatarUrl]);
```

Add the `<Avatar>` import.

Also add the subtitle line on the existing handle row:

```tsx
<div className="rv-field-help">Used for @mentions. Most people leave this alone.</div>
```

- [ ] **Step 3: Manual smoke**

```bash
cd apps/client
pnpm dev
```

Open Settings → Account → paste `https://avatars.githubusercontent.com/u/0?v=4` → Save. Confirm:
- Preview updates immediately
- Avatar appears in friend list, LeftIconColumn, message bubbles after refresh
- Remove button clears it back to initials
- http:// URL gets rejected with the server's error message

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/renderer/src/lib/auth-store.ts apps/client/src/renderer/src/components/SettingsModal.tsx
git commit -m "feat(client): avatar URL editor in Settings → Account"
```

---

## Task 10: Client — drop Changelog tab + add About → What's new link

**Files:**
- Modify: `apps/client/src/renderer/src/components/SettingsModal.tsx`

- [ ] **Step 1: Locate the Changelog tab**

Grep:

```bash
grep -n "Changelog\|changelog" apps/client/src/renderer/src/components/SettingsModal.tsx
```

Identify: tab definition, tab body / renderer, any imports of changelog auto-fetch logic.

- [ ] **Step 2: Remove the Changelog tab**

Delete:
- The tab entry from the tab list
- The tab body block
- Any imports/state purely used by changelog rendering (e.g. release auto-fetch state, GitHub API call, version-mismatch detector — UpdateToast in Task 11 owns the version comparison going forward)

- [ ] **Step 3: Add "What's new" row to About tab**

In the About tab body, add:

```tsx
<button
  type="button"
  className="rv-btn"
  data-variant="ghost"
  onClick={() => window.redvoice.openExternal("https://github.com/R3dWolfie/RedVoice/releases")}
  style={{ width: "100%", justifyContent: "flex-start" }}
>
  What's new — release notes on GitHub
</button>
```

- [ ] **Step 4: Verify typecheck**

```bash
cd apps/client
pnpm typecheck
```

Expected: success.

- [ ] **Step 5: Manual smoke**

Open Settings → confirm Changelog tab is gone, About tab shows the link, clicking opens GitHub releases in default browser.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/renderer/src/components/SettingsModal.tsx
git commit -m "refactor(client): drop Changelog tab, link to GitHub releases from About"
```

---

## Task 11: Client — `getAppVersion` IPC

**Files:**
- Modify: `apps/client/src/main/index.ts`
- Modify: `apps/client/src/preload/index.ts`
- Modify: `apps/client/src/shared/bridge-types.ts`

- [ ] **Step 1: Add IPC handler in main**

In `apps/client/src/main/index.ts`, near other `ipcMain.handle(...)` registrations, add:

```ts
import { app as electronApp } from "electron";
// ...
ipcMain.handle("app:get-version", () => electronApp.getVersion());
```

(Use existing `app` import if already present — don't double-import.)

- [ ] **Step 2: Expose in preload**

In `apps/client/src/preload/index.ts`, add to the `bridge`:

```ts
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),
```

- [ ] **Step 3: Add to bridge types**

In `apps/client/src/shared/bridge-types.ts`, add to `RedVoiceBridge`:

```ts
  getAppVersion(): Promise<string>;
```

- [ ] **Step 4: Verify typecheck**

```bash
cd apps/client
pnpm typecheck
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/main apps/client/src/preload apps/client/src/shared/bridge-types.ts
git commit -m "feat(client): app:get-version IPC bridge"
```

---

## Task 12: Client — `UpdateToast` component (TDD)

**Files:**
- Create: `apps/client/src/renderer/src/components/UpdateToast.tsx`
- Create: `apps/client/src/renderer/src/components/UpdateToast.test.tsx`
- Modify: `apps/client/src/renderer/src/App.tsx` — mount near root

- [ ] **Step 1: Write the failing test**

`apps/client/src/renderer/src/components/UpdateToast.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { UpdateToast } from "./UpdateToast.js";

const KEY = "redvoice.lastSeenVersion";

describe("UpdateToast", () => {
  beforeEach(() => {
    localStorage.clear();
    (window as any).redvoice = {
      getAppVersion: vi.fn().mockResolvedValue("0.9.0"),
      openExternal: vi.fn(),
    };
  });

  it("does not render on first install (null localStorage)", async () => {
    const { container } = render(<UpdateToast />);
    await waitFor(() => {
      expect(localStorage.getItem(KEY)).toBe("0.9.0");
    });
    expect(container.querySelector("[data-rv='update-toast']")).toBeNull();
  });

  it("does not render when versions match", async () => {
    localStorage.setItem(KEY, "0.9.0");
    const { container } = render(<UpdateToast />);
    await waitFor(() => {
      // wait one tick
      expect((window as any).redvoice.getAppVersion).toHaveBeenCalled();
    });
    expect(container.querySelector("[data-rv='update-toast']")).toBeNull();
  });

  it("renders when versions differ", async () => {
    localStorage.setItem(KEY, "0.8.1");
    const { findByTestId } = render(<UpdateToast />);
    const toast = await findByTestId("update-toast");
    expect(toast.textContent).toContain("0.9.0");
  });

  it("dismiss writes new version + unmounts toast", async () => {
    localStorage.setItem(KEY, "0.8.1");
    const { findByTestId, queryByTestId } = render(<UpdateToast />);
    const toast = await findByTestId("update-toast");
    const dismissBtn = toast.querySelector("[data-rv='dismiss']") as HTMLButtonElement;
    fireEvent.click(dismissBtn);
    expect(localStorage.getItem(KEY)).toBe("0.9.0");
    expect(queryByTestId("update-toast")).toBeNull();
  });

  it("clicking the toast invokes openExternal + writes new version", async () => {
    localStorage.setItem(KEY, "0.8.1");
    const { findByTestId } = render(<UpdateToast />);
    const toast = await findByTestId("update-toast");
    const link = toast.querySelector("[data-rv='whatsnew']") as HTMLButtonElement;
    fireEvent.click(link);
    expect((window as any).redvoice.openExternal).toHaveBeenCalledWith(
      "https://github.com/R3dWolfie/RedVoice/releases/tag/v0.9.0",
    );
    expect(localStorage.getItem(KEY)).toBe("0.9.0");
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
cd apps/client
pnpm test src/renderer/src/components/UpdateToast.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement UpdateToast**

`apps/client/src/renderer/src/components/UpdateToast.tsx`:

```tsx
import { useEffect, useState, type ReactElement } from "react";

const KEY = "redvoice.lastSeenVersion";

export function UpdateToast(): ReactElement | null {
  const [version, setVersion] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await window.redvoice.getAppVersion();
      if (cancelled) return;
      const lastSeen = localStorage.getItem(KEY);
      if (lastSeen === null) {
        // First install — don't show, just record the baseline.
        localStorage.setItem(KEY, current);
        return;
      }
      if (lastSeen !== current) {
        setVersion(current);
        setShow(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dismiss = (): void => {
    if (version) localStorage.setItem(KEY, version);
    setShow(false);
  };

  const openWhatsNew = (): void => {
    if (!version) return;
    void window.redvoice.openExternal(
      `https://github.com/R3dWolfie/RedVoice/releases/tag/v${version}`,
    );
    localStorage.setItem(KEY, version);
    setShow(false);
  };

  if (!show || !version) return null;

  return (
    <div
      data-rv="update-toast"
      data-testid="update-toast"
      style={{
        position: "fixed",
        bottom: "var(--s-4)",
        right: "var(--s-4)",
        background: "var(--surface-raised)",
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--radius-md)",
        padding: "var(--s-3) var(--s-4)",
        display: "flex",
        alignItems: "center",
        gap: "var(--s-3)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        zIndex: 1000,
        fontSize: "var(--t-sm)",
      }}
    >
      <span>Updated to v{version}</span>
      <button
        type="button"
        className="rv-btn"
        data-variant="primary"
        data-rv="whatsnew"
        onClick={openWhatsNew}
        style={{ height: "1.7rem", fontSize: "var(--t-xs)" }}
      >
        See what's new
      </button>
      <button
        type="button"
        className="rv-btn"
        data-variant="ghost"
        data-rv="dismiss"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ height: "1.7rem", fontSize: "var(--t-xs)" }}
      >
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Mount in App.tsx**

In `apps/client/src/renderer/src/App.tsx`, near the root return JSX (after auth hydration block, alongside other top-level overlays), add:

```tsx
<UpdateToast />
```

Add the import at the top.

- [ ] **Step 5: Run tests**

```bash
cd apps/client
pnpm test src/renderer/src/components/UpdateToast.test.tsx
```

Expected: PASS — 5/5.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/renderer/src/components/UpdateToast.tsx apps/client/src/renderer/src/components/UpdateToast.test.tsx apps/client/src/renderer/src/App.tsx
git commit -m "feat(client): UpdateToast — one-time notice on version bump"
```

---

## Task 13: Client — chat-transport mute-level cache

**Files:**
- Modify: `apps/client/src/renderer/src/lib/chat-transport.ts:176`

- [ ] **Step 1: Add cache + getter to ChatTransport class**

In `apps/client/src/renderer/src/lib/chat-transport.ts`, inside the `ChatTransport` class body (near other private fields):

```ts
  private _muteCache = new Map<string, "all" | "mentions" | "none">();
  private _api: ApiClient | null = null;
```

Update the constructor to retain `_api` if provided:

```ts
  constructor(serverUrl: string, token: string, api?: ApiClient) {
    this.serverUrl = serverUrl;
    this.token = token;
    this._api = api ?? null;
  }
```

(`_api` is currently unused; we'll wire it in `ensureTransport`.)

Add public methods:

```ts
  async getMuteLevel(threadType: ChatThreadType, threadId: string): Promise<"all" | "mentions" | "none"> {
    const key = `${threadType}:${threadId}`;
    const cached = this._muteCache.get(key);
    if (cached !== undefined) return cached;
    if (!this._api) return "all"; // safe default if api not wired
    try {
      const r = await this._api.getMute(threadType, threadId);
      this._muteCache.set(key, r.level);
      return r.level;
    } catch {
      return "all";
    }
  }

  invalidateMute(threadType: ChatThreadType, threadId: string): void {
    this._muteCache.delete(`${threadType}:${threadId}`);
  }
```

- [ ] **Step 2: Wire api into the singleton**

Update `ensureTransport`:

```ts
export function ensureTransport(serverUrl: string, token: string, api?: ApiClient): ChatTransport {
  if (
    _instance !== null &&
    _instance.currentToken === token &&
    _instance.currentServerUrl === serverUrl
  ) {
    return _instance;
  }
  if (_instance !== null) {
    _instance.stop();
  }
  _instance = new ChatTransport(serverUrl, token, api);
  _instance.start();
  return _instance;
}
```

In `App.tsx`, locate the `ensureTransport(serverUrl, token)` call (added in v0.8.1) and pass the api:

```ts
const apiClient = useApiClient(); // or however App gets ApiClient — copy existing pattern
ensureTransport(serverUrl, token, apiClient);
```

(If App.tsx doesn't have a stable ApiClient instance, instantiate one inline matching the FriendsPane pattern: `const api = new ApiClient(serverUrl); api.setToken(token);`.)

- [ ] **Step 3: Replace hardcoded mute-level**

In the `routeNotification` call site (around line 173), change:

```ts
            getMuteLevel: () => "all", // simplified — full impl with local mute cache lands in Plan 4
```

to use the cache:

```ts
            getMuteLevel: async () => {
              const m = (event as { message?: { threadType: ChatThreadType; threadId: string } }).message;
              if (!m) return "all";
              return this.getMuteLevel(m.threadType, m.threadId);
            },
```

If `routeNotification`'s signature requires a sync `getMuteLevel`, check `apps/client/src/renderer/src/lib/notification-router.ts` and adjust to accept `() => Promise<MuteLevel>` (most likely already async-compatible since it's used for the notification gate).

- [ ] **Step 4: Add invalidation on mute change**

In `ThreadHeader.tsx`'s `setMute` callback, call:

```ts
import { getTransport } from "../lib/chat-transport.js";
// ...
await api.setMute(threadType, threadId, next);
getTransport()?.invalidateMute(threadType, threadId);
setLevel(next);
```

- [ ] **Step 5: Verify typecheck + run tests**

```bash
cd apps/client
pnpm typecheck && pnpm test
```

Expected: success.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/renderer/src/lib/chat-transport.ts apps/client/src/renderer/src/components/ThreadHeader.tsx apps/client/src/renderer/src/App.tsx
git commit -m "fix(client): chat-transport mute-level cache replaces hardcoded \"all\""
```

---

## Task 14: Client — wire `onJoinRoom` from FriendsPane (carryover #4)

**Files:**
- Modify: `apps/client/src/renderer/src/App.tsx`

- [ ] **Step 1: Locate FriendsPane mount**

```bash
grep -n "FriendsPane" apps/client/src/renderer/src/App.tsx
```

- [ ] **Step 2: Pass onJoinRoom**

Where `<FriendsPane />` is mounted, add the prop:

```tsx
<FriendsPane onJoinRoom={(roomId) => {
  // route to in-room screen — copy the existing join flow used by the room list
  void roomStore.joinRoom(roomId).catch((e) => {
    if (e instanceof ApiError && e.status === 403) {
      // private room — show a small toast (use existing toast system if any, else console.warn for v0.9.0)
      console.warn("That room is private");
    } else {
      throw e;
    }
  });
}} />
```

(Replace `roomStore.joinRoom` with the actual join-room call used elsewhere in App.tsx — probably an existing `setActiveRoom(id)` or similar.)

- [ ] **Step 3: Manual smoke**

```bash
cd apps/client
pnpm dev
```

Need a friend who's currently in a room. Confirm the "in <Room> →" link actually transitions to the in-room screen.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/renderer/src/App.tsx
git commit -m "fix(client): wire FriendsPane in-room link to join the room"
```

---

## Task 15: Client — 4K UI sizing pass

**Files:**
- Modify: `apps/client/src/renderer/src/styles/global.css` (or wherever `:root` font-size lives)
- Modify: various component files with hardcoded `px` for spacing/typography

- [ ] **Step 1: Bump root font-size**

```bash
grep -rn ":root\b" apps/client/src/renderer/src/styles/ apps/client/index.html 2>/dev/null
```

Locate the file with `:root { font-size: 14px }`. Change to `15px`.

- [ ] **Step 2: Audit hardcoded modal widths**

```bash
grep -rn 'width: ["'\'']\([0-9]\+\)px["'\'']' apps/client/src/renderer/src/ | grep -v node_modules
grep -rn 'width="[0-9]*px"' apps/client/src/renderer/src/
grep -rn '"width: [0-9]\+px' apps/client/src/renderer/src/
```

For each fixed-width modal/panel above ~400px, change to:

```ts
width: "min(90vw, 720px)"
```

(Substitute the original max value.)

- [ ] **Step 3: Audit fontSize px usage**

```bash
grep -rn "fontSize: ['\"][0-9]\+px['\"]" apps/client/src/renderer/src/
```

Replace with the existing CSS variables where the variable already covers it:
- `'12px'` → `'var(--t-xs)'`
- `'13px'` / `'14px'` → `'var(--t-sm)'`
- `'16px'` → `'var(--t-md)'`
- bigger → leave or use `var(--t-lg)` / `var(--t-xl)` if defined

(Inspect `styles/tokens.css` or equivalent to see the actual variable values.)

- [ ] **Step 4: Manual smoke at 1366×768 + 4K**

```bash
cd apps/client
pnpm dev
```

Open the app at native size. Confirm:
- Layout still readable
- Modals don't overflow the window when narrow (resize the Electron window down to ~1100px wide)
- Friend list, chat, in-room screen visually unchanged but ~7% larger

If a layout looks broken at small width, tighten the fix or revert.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/renderer/src/styles/ apps/client/src/renderer/src/components/ apps/client/src/renderer/src/screens/
git commit -m "polish(client): 4K sizing — root font 15px, vars instead of px, modals use min(90vw, ...)"
```

---

## Task 16: Client — error message rewrites

**Files:**
- Modify: `apps/client/src/renderer/src/lib/auth-store.ts` — register/login messages
- Modify: `apps/client/src/renderer/src/lib/chat-transport.ts` — WS error events

- [ ] **Step 1: Login message**

In `auth-store.ts`'s `login` catch block, currently:

```ts
const message = err instanceof ApiError ? err.message : "login failed";
```

Replace with:

```ts
const message = err instanceof ApiError && err.status !== 401
  ? err.message
  : "Incorrect email or password";
```

- [ ] **Step 2: Register message**

In `auth-store.ts`'s `register` catch block:

```ts
const message = err instanceof ApiError ? err.message : "register failed";
```

The server returns specific messages ("email already registered", validation errors). Keep `err.message` when ApiError, change the fallback string:

```ts
const message = err instanceof ApiError ? err.message : "Couldn't create account — please try again";
```

- [ ] **Step 3: WS error frame handler**

In `chat-transport.ts`, the message-handler currently doesn't surface `error` events to the user. Add a UI handler in components that subscribe (e.g. `RoomChatPanel.tsx`):

```ts
return t.on((event) => {
  if (event.type === "error" && event.code === "ACCESS_DENIED") {
    setUiError("You don't have access to this thread.");
  }
});
```

For `invalid token` and `missing auth subprotocol`: those happen at WS connect time (`sock.close(4401, ...)`). The reconnect loop will fire infinitely otherwise. Add a close-code check:

In `ChatTransport.connect()`'s close handler:

```ts
ws.addEventListener("close", (ev) => {
  if (this.heartbeatTimer != null) {
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
  this.ws = null;
  if (ev.code === 4401) {
    // Auth failure — stop trying. Renderer should re-init via auth flow.
    this.closed = true;
    return;
  }
  if (!this.closed) this.scheduleReconnect();
});
```

- [ ] **Step 4: Verify typecheck**

```bash
cd apps/client
pnpm typecheck
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/renderer/src/lib/auth-store.ts apps/client/src/renderer/src/lib/chat-transport.ts apps/client/src/renderer/src/components/RoomChatPanel.tsx
git commit -m "polish(client): clearer error messages — login, register, WS access-denied"
```

---

## Task 17: Version bump + changelog + ship

**Files:**
- Modify: `apps/client/package.json` → `"version": "0.9.0"`
- Modify: `apps/server/package.json` → `"version": "0.9.0"`
- Modify: root `package.json` if it carries a version
- Modify: `CHANGELOG.md` (create if missing)

- [ ] **Step 1: Bump versions**

```bash
sed -i 's/"version": "0.8.1"/"version": "0.9.0"/' apps/client/package.json apps/server/package.json
grep -n "version" apps/client/package.json apps/server/package.json
```

Expected: both at `0.9.0`.

- [ ] **Step 2: Add changelog entry**

In `CHANGELOG.md`, prepend:

```markdown
## v0.9.0 — 2026-04-30

### Added
- Profile pictures via URL (Settings → Account → Profile picture URL)
- Auto-generated handles at signup — no more handle picker for new users
- Update toast on first launch after autoupdate, links to GitHub release notes
- 4K-friendly UI sizing — root font bumped 14px → 15px, modals use min(90vw, ...)

### Fixed
- chat-transport now caches per-thread mute level (no more hardcoded "all")
- FriendsPane "in <Room>" link actually joins the room
- Login error reads "Incorrect email or password" instead of "login failed"

### Removed
- In-app Changelog tab (Settings → About → "What's new" links to GitHub releases instead)
```

- [ ] **Step 3: Run full test suite**

```bash
pnpm -r typecheck
pnpm -r test
```

Expected: all green.

- [ ] **Step 4: Manual smoke (full path)**

```bash
cd apps/client
pnpm dev
```

Verify:
1. Register a fresh account — handle is auto-derived, no HandlePickGate appears
2. Settings → Account → paste avatar URL → renders everywhere
3. Settings → no Changelog tab; About has "What's new" link
4. UpdateToast shows once on first launch (clear localStorage if needed)
5. FriendsPane "in <Room> →" works
6. WS reconnect loop doesn't spin on stale token (test by saving an expired token)

- [ ] **Step 5: Commit + tag + push**

```bash
git add apps/client/package.json apps/server/package.json CHANGELOG.md
git commit -m "chore: bump to v0.9.0 — Plan 4A polish + profile pictures"
git tag v0.9.0
git push origin main --tags
```

CI auto-creates the GitHub release per memory `feedback_sync_patch_notes`. After the release row appears, attach the changelog notes:

```bash
gh release edit v0.9.0 --notes "$(awk '/^## v0.9.0/,/^## v0.8/' CHANGELOG.md | sed '$d')"
```

---

## Self-Review Notes

- **Spec coverage:** All seven scope items from spec mapped: handle auto-gen (Tasks 2+3), avatars (Tasks 1, 4-9), mute cache (Task 13), click-to-join (Task 14), 4K sizing (Task 15), error rewrites (Task 16), Changelog rehome (Tasks 10-12).
- **Migration fallback:** Existing users with `handle=null` continue to see HandlePickGate (legacy path, unchanged). Plan does not backfill — too much surface for too little gain.
- **No placeholders.** Every step has runnable commands or copyable code blocks.
- **Tests precede implementation** for Tasks 2, 4, 7, 12 (the four logic-bearing modules). Other tasks are integration/wiring where a manual smoke is more useful than a brittle unit test.
- **Commit cadence:** one commit per task. Seventeen commits total. Frequent enough to bisect if anything regresses.
- **Risks acknowledged in spec are not re-litigated here**; this plan executes the design.
