# RedVoice Plan 1 — App-Server Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full Node/Fastify HTTP app-server for RedVoice — accounts, persistent rooms, and LiveKit access-token minting — backed by SQLite via Prisma. End state: a fully-tested server you can `curl` against. No media server integration yet (tokens are minted but no LiveKit is running).

**Architecture:** Single Node.js process, Fastify 5, Prisma 6 + SQLite, argon2id for passwords, `jsonwebtoken` for session JWTs, `livekit-server-sdk` for LiveKit AccessToken minting. Zod for runtime input validation + env var parsing. Vitest for tests. Monorepo-ready (pnpm workspace) so later plans can add `apps/client` and `packages/shared` without restructuring.

**Tech Stack:** Node.js ≥20, TypeScript 5, pnpm 9, Fastify 5, Prisma 6, SQLite, Vitest, Zod, `@node-rs/argon2`, `jsonwebtoken`, `livekit-server-sdk`, `@fastify/rate-limit`.

**Spec reference:** `docs/superpowers/specs/2026-04-24-redvoice-design.md`

---

## File Structure

```
/var/home/red/Projects/RedVoice/
├── package.json                      # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json                # strict TS config inherited by all packages
├── .editorconfig
├── .gitignore                        # already exists; we'll extend
├── README.md                         # already exists; we'll extend
│
├── packages/
│   └── shared/                       # TS types shared with future client
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.ts              # DTOs: AuthDTOs, RoomDTO, TokenResponse
│
└── apps/
    └── server/
        ├── package.json
        ├── tsconfig.json
        ├── vitest.config.ts
        ├── prisma/
        │   └── schema.prisma         # User, Session, Room, RoomMembership
        ├── src/
        │   ├── index.ts              # entry — builds app and starts listen()
        │   ├── app.ts                # Fastify app factory (used by tests too)
        │   ├── config.ts             # env var loading + validation (zod)
        │   ├── db.ts                 # Prisma client singleton
        │   ├── errors.ts             # AppError classes + Fastify error hook
        │   ├── auth/
        │   │   ├── password.ts       # argon2id wrapper
        │   │   ├── jwt.ts            # session JWT sign/verify
        │   │   ├── middleware.ts     # Fastify preHandler requiring auth
        │   │   └── routes.ts         # /auth/register, /auth/login, /auth/logout, /me
        │   ├── rooms/
        │   │   └── routes.ts         # /rooms CRUD + /rooms/:id/token
        │   └── livekit.ts            # AccessToken wrapper
        └── tests/
            ├── helpers/
            │   ├── app.ts            # test app factory (in-memory DB)
            │   └── fixtures.ts       # createTestUser() etc.
            ├── password.test.ts
            ├── jwt.test.ts
            ├── errors.test.ts
            ├── config.test.ts
            ├── auth-register.test.ts
            ├── auth-login.test.ts
            ├── auth-middleware.test.ts
            ├── me-and-logout.test.ts
            ├── rooms.test.ts
            └── token.test.ts
```

**Key decomposition decisions:**
- `app.ts` separate from `index.ts` so tests build the app without starting an HTTP listener
- `config.ts` is the single source of truth for env vars — nothing else should read `process.env`
- Route files are tiny; heavy logic lives in neighboring modules (`password.ts`, `jwt.ts`, `livekit.ts`)

---

## Task 1: Monorepo scaffolding

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.editorconfig`
- Modify: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: Verify pnpm and Node versions**

Run: `node --version && pnpm --version`
Expected: Node ≥20, pnpm ≥9. If pnpm is missing: `npm install -g pnpm@9`.

- [ ] **Step 2: Create workspace root `package.json`**

Write to `package.json`:

```json
{
  "name": "redvoice",
  "private": true,
  "version": "0.0.0",
  "engines": {
    "node": ">=20"
  },
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "server:dev": "pnpm --filter @redvoice/server dev",
    "server:test": "pnpm --filter @redvoice/server test"
  }
}
```

- [ ] **Step 3: Create `pnpm-workspace.yaml`**

Write to `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 4: Create `tsconfig.base.json`**

Write to `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 5: Create `.editorconfig`**

Write to `.editorconfig`:

```
root = true

[*]
charset = utf-8
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
```

- [ ] **Step 6: Extend `.gitignore`**

Replace the existing `.gitignore` file contents with:

```
node_modules/
dist/
build/
*.log
.env
.env.local
.DS_Store

# Prisma
apps/server/prisma/*.db
apps/server/prisma/*.db-journal

# Vitest
coverage/
```

- [ ] **Step 7: Run `pnpm install` to validate workspace**

Run: `pnpm install`
Expected: completes without error. Creates `pnpm-lock.yaml` and an empty `node_modules/`.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .editorconfig .gitignore pnpm-lock.yaml
git commit -m "chore: monorepo scaffolding with pnpm workspaces"
```

---

## Task 2: Shared types package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

Write to `packages/shared/package.json`:

```json
{
  "name": "@redvoice/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

Write to `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/shared/src/index.ts`**

Write to `packages/shared/src/index.ts`:

```ts
// Auth DTOs
export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: UserDTO;
}

export interface UserDTO {
  id: string;
  email: string;
  displayName: string;
}

// Room DTOs
export interface CreateRoomRequest {
  name: string;
}

export interface RoomDTO {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string; // ISO 8601
  isOwner: boolean;
  lastJoined: string | null; // ISO 8601 or null if never joined
}

export interface RoomListResponse {
  owned: RoomDTO[];
  recent: RoomDTO[];
}

// Token DTOs
export interface LiveKitTokenResponse {
  token: string;
  url: string; // wss://livekit-host
  roomId: string;
}

// Error shape returned on any non-2xx
export interface ErrorResponse {
  error: {
    code: string;     // e.g. "VALIDATION_ERROR"
    message: string;  // human readable
  };
}
```

- [ ] **Step 4: Build the shared package**

Run: `pnpm --filter @redvoice/shared build`
Expected: creates `packages/shared/dist/index.js` and `packages/shared/dist/index.d.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): DTOs for auth, rooms, tokens"
```

---

## Task 3: Server package skeleton + Fastify app

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/vitest.config.ts`
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/index.ts`
- Create: `apps/server/tests/helpers/app.ts`

- [ ] **Step 1: Create `apps/server/package.json`**

Write to `apps/server/package.json`:

```json
{
  "name": "@redvoice/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "prisma": "prisma",
    "db:migrate": "prisma migrate dev",
    "db:reset": "prisma migrate reset --force"
  },
  "dependencies": {
    "@fastify/rate-limit": "^10.2.0",
    "@node-rs/argon2": "^2.0.2",
    "@prisma/client": "^6.1.0",
    "@redvoice/shared": "workspace:*",
    "fastify": "^5.2.0",
    "jsonwebtoken": "^9.0.2",
    "livekit-server-sdk": "^2.9.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^22.10.0",
    "prisma": "^6.1.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `apps/server/tsconfig.json`**

Write to `apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `apps/server/vitest.config.ts`**

Write to `apps/server/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 10_000,
    pool: "forks",            // Prisma doesn't like threads
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,   // tests share the dev.db; serialise them
    env: {
      // getConfig() reads process.env at runtime. Vitest injects these into
      // the test process's env so routes can mint tokens etc.
      // Prisma resolves `file:./...` relative to schema.prisma, so this is apps/server/prisma/dev.db
      DATABASE_URL: "file:./dev.db",
      JWT_SECRET: "x".repeat(32),
      LIVEKIT_URL: "ws://localhost:7880",
      LIVEKIT_API_KEY: "testkey",
      LIVEKIT_API_SECRET: "y".repeat(32),
      NODE_ENV: "test",
    },
  },
});
```

Note: tests share the `dev.db` file with the `pnpm server:dev` loop. `resetDb()` truncates all tables between tests. If you want a separate test DB, change `DATABASE_URL` above to `"file:./test.db"` and run `DATABASE_URL="file:./test.db" pnpm prisma migrate deploy` once.

- [ ] **Step 4: Install dependencies**

Run: `pnpm install`
Expected: all dependencies resolve, `apps/server/node_modules` populated.

- [ ] **Step 5: Create the Fastify app factory**

Write to `apps/server/src/app.ts`:

```ts
import Fastify, { type FastifyInstance } from "fastify";

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    disableRequestLogging: true,
  });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
```

- [ ] **Step 6: Create the entry point**

Write to `apps/server/src/index.ts`:

```ts
import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const app = await buildApp({ logger: true });
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen({ port, host });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 7: Create a test-only app helper**

Write to `apps/server/tests/helpers/app.ts`:

```ts
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

export async function makeTestApp(): Promise<FastifyInstance> {
  return buildApp({ logger: false });
}
```

- [ ] **Step 8: Write the first test — the health endpoint**

Write to `apps/server/tests/health.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { makeTestApp } from "./helpers/app.js";
import type { FastifyInstance } from "fastify";

describe("GET /health", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("returns status ok", async () => {
    app = await makeTestApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 9: Run the test**

Run: `pnpm --filter @redvoice/server test`
Expected: 1 test passes.

- [ ] **Step 10: Commit**

```bash
git add apps/server packages/shared pnpm-lock.yaml
git commit -m "feat(server): Fastify app skeleton with /health + test helper"
```

---

## Task 4: Prisma schema + client

**Files:**
- Create: `apps/server/prisma/schema.prisma`
- Create: `apps/server/src/db.ts`
- Create: `apps/server/tests/helpers/db.ts`

- [ ] **Step 1: Create `apps/server/prisma/schema.prisma`**

Write to `apps/server/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  displayName  String
  passwordHash String
  createdAt    DateTime @default(now())

  sessions      Session[]
  ownedRooms    Room[]           @relation("RoomOwner")
  memberships   RoomMembership[]
}

model Session {
  id        String    @id @default(uuid())
  userId    String
  createdAt DateTime  @default(now())
  revokedAt DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model Room {
  id        String   @id @default(uuid())
  name      String
  ownerId   String
  createdAt DateTime @default(now())

  owner       User             @relation("RoomOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  memberships RoomMembership[]

  @@index([ownerId])
}

model RoomMembership {
  userId     String
  roomId     String
  lastJoined DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  room Room @relation(fields: [roomId], references: [id], onDelete: Cascade)

  @@id([userId, roomId])
  @@index([roomId])
}
```

- [ ] **Step 2: Create a local `.env` file for dev DB**

Write to `apps/server/.env` (this file is gitignored):

```
DATABASE_URL="file:./dev.db"
JWT_SECRET="dev-jwt-secret-change-me-in-prod-min-32-chars-aaaaaa"
LIVEKIT_URL="ws://localhost:7880"
LIVEKIT_API_KEY="devkey"
LIVEKIT_API_SECRET="devsecretdevsecretdevsecretdev32"
```

- [ ] **Step 3: Run the first Prisma migration**

Run: `cd apps/server && pnpm prisma migrate dev --name init`
Expected: creates `apps/server/prisma/migrations/<timestamp>_init/` and generates the Prisma client. Creates `apps/server/prisma/dev.db`.

- [ ] **Step 4: Create Prisma client singleton**

Write to `apps/server/src/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __redvoice_prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__redvoice_prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "test" ? [] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__redvoice_prisma = prisma;
}
```

- [ ] **Step 5: Create a test DB helper that truncates tables between tests**

Write to `apps/server/tests/helpers/db.ts`:

```ts
import { prisma } from "../../src/db.js";

export async function resetDb(): Promise<void> {
  // Delete in FK-safe order. SQLite doesn't need this strictly, but being explicit is clear.
  await prisma.roomMembership.deleteMany();
  await prisma.room.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
```

- [ ] **Step 6: Write a test that proves the DB works**

Write to `apps/server/tests/db.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb, disconnectDb } from "./helpers/db.js";

describe("Prisma + SQLite smoke test", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it("creates and retrieves a user", async () => {
    const user = await prisma.user.create({
      data: { email: "a@b.com", displayName: "alice", passwordHash: "fake" },
    });
    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found?.email).toBe("a@b.com");
  });
});
```

- [ ] **Step 7: Run the test**

Run: `pnpm --filter @redvoice/server test`
Expected: all tests (health + db) pass.

- [ ] **Step 8: Commit**

```bash
git add apps/server/prisma apps/server/src/db.ts apps/server/tests
git commit -m "feat(server): Prisma schema + SQLite migration + test helpers"
```

Note: the `.env` file is NOT committed (it's gitignored).

---

## Task 5: Config loading with env var validation

**Files:**
- Create: `apps/server/src/config.ts`
- Create: `apps/server/tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

Write to `apps/server/tests/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  const valid = {
    DATABASE_URL: "file:./dev.db",
    JWT_SECRET: "x".repeat(32),
    LIVEKIT_URL: "ws://localhost:7880",
    LIVEKIT_API_KEY: "devkey",
    LIVEKIT_API_SECRET: "y".repeat(32),
  };

  it("parses valid env vars", () => {
    const cfg = parseConfig(valid);
    expect(cfg.JWT_SECRET).toBe(valid.JWT_SECRET);
    expect(cfg.LIVEKIT_URL).toBe(valid.LIVEKIT_URL);
  });

  it("throws when JWT_SECRET is too short", () => {
    expect(() => parseConfig({ ...valid, JWT_SECRET: "short" })).toThrow();
  });

  it("throws when a required var is missing", () => {
    const incomplete = { ...valid };
    // @ts-expect-error — removing a required key for the test
    delete incomplete.JWT_SECRET;
    expect(() => parseConfig(incomplete)).toThrow();
  });

  it("throws when LIVEKIT_API_SECRET is too short", () => {
    expect(() => parseConfig({ ...valid, LIVEKIT_API_SECRET: "short" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `pnpm --filter @redvoice/server test tests/config.test.ts`
Expected: FAIL, "Cannot find module '../src/config.js'".

- [ ] **Step 3: Implement `config.ts`**

Write to `apps/server/src/config.ts`:

```ts
import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  LIVEKIT_URL: z.string().url().or(z.string().startsWith("ws")),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z
    .string()
    .min(32, "LIVEKIT_API_SECRET must be at least 32 chars"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Config = z.infer<typeof configSchema>;

export function parseConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): Config {
  return configSchema.parse(env);
}

let cached: Config | undefined;
export function getConfig(): Config {
  if (!cached) cached = parseConfig(process.env);
  return cached;
}

// Test-only reset
export function __resetConfigForTests(): void {
  cached = undefined;
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `pnpm --filter @redvoice/server test tests/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/config.ts apps/server/tests/config.test.ts
git commit -m "feat(server): env var validation via zod"
```

---

## Task 6: Error types + Fastify error handler

**Files:**
- Create: `apps/server/src/errors.ts`
- Create: `apps/server/tests/errors.test.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Write the failing test**

Write to `apps/server/tests/errors.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeTestApp } from "./helpers/app.js";
import { AuthError, ConflictError, NotFoundError, ValidationError } from "../src/errors.js";

describe("error handler", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });

  it("maps ValidationError to 400 with structured body", async () => {
    app = await makeTestApp();
    app.get("/boom", async () => {
      throw new ValidationError("bad input");
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "bad input" },
    });
  });

  it("maps AuthError to 401", async () => {
    app = await makeTestApp();
    app.get("/boom", async () => {
      throw new AuthError("nope");
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("AUTH_ERROR");
  });

  it("maps NotFoundError to 404", async () => {
    app = await makeTestApp();
    app.get("/boom", async () => {
      throw new NotFoundError("gone");
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("maps ConflictError to 409", async () => {
    app = await makeTestApp();
    app.get("/boom", async () => {
      throw new ConflictError("dup");
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("unknown errors → 500 without leaking stack", async () => {
    app = await makeTestApp();
    app.get("/boom", async () => {
      throw new Error("internal detail we don't want leaked");
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).not.toContain("internal detail");
  });
});
```

- [ ] **Step 2: Run test — expect failure**

Run: `pnpm --filter @redvoice/server test tests/errors.test.ts`
Expected: FAIL (cannot import from `src/errors.js`).

- [ ] **Step 3: Implement `errors.ts`**

Write to `apps/server/src/errors.ts`:

```ts
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
  }
}
export class AuthError extends AppError {
  constructor(message: string = "unauthorized") {
    super("AUTH_ERROR", message, 401);
  }
}
export class ForbiddenError extends AppError {
  constructor(message: string = "forbidden") {
    super("FORBIDDEN", message, 403);
  }
}
export class NotFoundError extends AppError {
  constructor(message: string = "not found") {
    super("NOT_FOUND", message, 404);
  }
}
export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
      return;
    }
    // Fastify's built-in validation errors
    if (error.validation) {
      reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: error.message },
      });
      return;
    }
    // Anything else: log but don't leak
    request.log.error({ err: error }, "unhandled error");
    reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "internal server error" },
    });
  });
}
```

- [ ] **Step 4: Wire the error handler into `app.ts`**

Replace the contents of `apps/server/src/app.ts` with:

```ts
import Fastify, { type FastifyInstance } from "fastify";
import { registerErrorHandler } from "./errors.js";

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    disableRequestLogging: true,
  });

  registerErrorHandler(app);

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
```

- [ ] **Step 5: Run tests — expect pass**

Run: `pnpm --filter @redvoice/server test`
Expected: all tests pass (health + db + config + errors = 11 total).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/errors.ts apps/server/src/app.ts apps/server/tests/errors.test.ts
git commit -m "feat(server): typed AppError classes + Fastify error handler"
```

---

## Task 7: Password hashing

**Files:**
- Create: `apps/server/src/auth/password.ts`
- Create: `apps/server/tests/password.test.ts`

- [ ] **Step 1: Write the failing test**

Write to `apps/server/tests/password.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password.js";

describe("password hashing", () => {
  it("hashes and verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("real");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("produces different hashes for the same input (salted)", async () => {
    const a = await hashPassword("pw-pw-pw-pw");
    const b = await hashPassword("pw-pw-pw-pw");
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --filter @redvoice/server test tests/password.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `password.ts`**

Write to `apps/server/src/auth/password.ts`:

```ts
import { hash, verify } from "@node-rs/argon2";

export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(password: string, digest: string): Promise<boolean> {
  try {
    return await verify(digest, password);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @redvoice/server test tests/password.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/auth/password.ts apps/server/tests/password.test.ts
git commit -m "feat(server): argon2id password hashing utility"
```

---

## Task 8: Session JWT sign/verify

**Files:**
- Create: `apps/server/src/auth/jwt.ts`
- Create: `apps/server/tests/jwt.test.ts`

- [ ] **Step 1: Write the failing test**

Write to `apps/server/tests/jwt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { signSessionToken, verifySessionToken } from "../src/auth/jwt.js";

const secret = "z".repeat(40);

describe("session JWT", () => {
  it("signs and verifies a token", () => {
    const token = signSessionToken({ userId: "u1", sessionId: "s1" }, secret);
    const payload = verifySessionToken(token, secret);
    expect(payload.userId).toBe("u1");
    expect(payload.sessionId).toBe("s1");
  });

  it("rejects a token signed with a different secret", () => {
    const token = signSessionToken({ userId: "u1", sessionId: "s1" }, secret);
    expect(() => verifySessionToken(token, "w".repeat(40))).toThrow();
  });

  it("rejects a malformed token", () => {
    expect(() => verifySessionToken("nope", secret)).toThrow();
  });

  it("embeds a 30-day exp by default", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signSessionToken({ userId: "u1", sessionId: "s1" }, secret);
    const payload = verifySessionToken(token, secret);
    const thirtyDays = 30 * 24 * 60 * 60;
    expect(payload.exp).toBeGreaterThan(now + thirtyDays - 60);
    expect(payload.exp).toBeLessThan(now + thirtyDays + 60);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --filter @redvoice/server test tests/jwt.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `jwt.ts`**

Write to `apps/server/src/auth/jwt.ts`:

```ts
import jwt from "jsonwebtoken";

export interface SessionTokenClaims {
  userId: string;
  sessionId: string;
}

export interface SessionTokenPayload extends SessionTokenClaims {
  iat: number;
  exp: number;
}

const EXPIRES_IN_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function signSessionToken(claims: SessionTokenClaims, secret: string): string {
  return jwt.sign(claims, secret, { expiresIn: EXPIRES_IN_SECONDS, algorithm: "HS256" });
}

export function verifySessionToken(token: string, secret: string): SessionTokenPayload {
  const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
  if (typeof decoded === "string") {
    throw new Error("unexpected string JWT payload");
  }
  if (typeof decoded.userId !== "string" || typeof decoded.sessionId !== "string") {
    throw new Error("JWT missing required claims");
  }
  return decoded as SessionTokenPayload;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @redvoice/server test tests/jwt.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/auth/jwt.ts apps/server/tests/jwt.test.ts
git commit -m "feat(server): session JWT sign/verify"
```

---

## Task 9: Register endpoint

**Files:**
- Create: `apps/server/src/auth/routes.ts`
- Create: `apps/server/tests/auth-register.test.ts`
- Create: `apps/server/tests/helpers/fixtures.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/tests/helpers/app.ts`

- [ ] **Step 1: Create `tests/helpers/fixtures.ts`**

Write to `apps/server/tests/helpers/fixtures.ts`:

```ts
import { prisma } from "../../src/db.js";
import { hashPassword } from "../../src/auth/password.js";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
}

let counter = 0;

export async function createTestUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
  counter += 1;
  const password = overrides.password ?? "password-password-pw";
  const email = overrides.email ?? `user${counter}@test.local`;
  const displayName = overrides.displayName ?? `user${counter}`;
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, displayName, passwordHash },
  });
  return { id: user.id, email, password, displayName };
}
```

- [ ] **Step 2: Update the test app helper to use the real app with routes**

Replace the contents of `apps/server/tests/helpers/app.ts`:

```ts
import { buildApp } from "../../src/app.js";
import { resetDb } from "./db.js";
import type { FastifyInstance } from "fastify";

export async function makeTestApp(): Promise<FastifyInstance> {
  await resetDb();
  return buildApp({ logger: false });
}
```

- [ ] **Step 3: Write the failing test**

Write to `apps/server/tests/auth-register.test.ts`:

```ts
import { describe, it, expect, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeTestApp } from "./helpers/app.js";
import { disconnectDb } from "./helpers/db.js";

describe("POST /auth/register", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });
  afterAll(async () => {
    await disconnectDb();
  });

  it("creates a user and returns a session token", async () => {
    app = await makeTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "a@b.com", password: "longenough-pw-123", displayName: "alice" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toEqual(expect.any(String));
    expect(body.user.email).toBe("a@b.com");
    expect(body.user.displayName).toBe("alice");
    expect(body.user.id).toEqual(expect.any(String));
  });

  it("rejects duplicate email", async () => {
    app = await makeTestApp();
    const payload = { email: "a@b.com", password: "longenough-pw-123", displayName: "alice" };
    await app.inject({ method: "POST", url: "/auth/register", payload });
    const res = await app.inject({ method: "POST", url: "/auth/register", payload });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("rejects password shorter than 12 chars", async () => {
    app = await makeTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "a@b.com", password: "short", displayName: "alice" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid email", async () => {
    app = await makeTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "not-an-email", password: "longenough-pw-123", displayName: "alice" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects missing displayName", async () => {
    app = await makeTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "a@b.com", password: "longenough-pw-123" },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 4: Run — expect failure**

Run: `pnpm --filter @redvoice/server test tests/auth-register.test.ts`
Expected: FAIL (404 or missing route).

- [ ] **Step 5: Implement `auth/routes.ts` (register only for now)**

Write to `apps/server/src/auth/routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { getConfig } from "../config.js";
import { hashPassword } from "./password.js";
import { signSessionToken } from "./jwt.js";
import { ConflictError, ValidationError } from "../errors.js";

const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, "password must be at least 12 characters"),
  displayName: z.string().min(1).max(50),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (request, reply) => {
    const parsed = registerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "invalid input");
    }
    const { email, password, displayName } = parsed.data;

    const passwordHash = await hashPassword(password);

    let user;
    try {
      user = await prisma.user.create({
        data: { email, displayName, passwordHash },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("email already registered");
      }
      throw err;
    }

    const session = await prisma.session.create({ data: { userId: user.id } });
    const token = signSessionToken(
      { userId: user.id, sessionId: session.id },
      getConfig().JWT_SECRET,
    );

    reply.status(201).send({
      token,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
  });
}
```

- [ ] **Step 6: Wire the auth routes into `app.ts`**

Replace the contents of `apps/server/src/app.ts`:

```ts
import Fastify, { type FastifyInstance } from "fastify";
import { registerErrorHandler } from "./errors.js";
import { authRoutes } from "./auth/routes.js";

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    disableRequestLogging: true,
  });

  registerErrorHandler(app);

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(authRoutes);

  return app;
}
```

- [ ] **Step 7: Run — expect pass**

Run: `pnpm --filter @redvoice/server test tests/auth-register.test.ts`
Expected: 5 tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/auth/routes.ts apps/server/src/app.ts apps/server/tests
git commit -m "feat(server): POST /auth/register with argon2 + session JWT"
```

---

## Task 10: Login endpoint

**Files:**
- Modify: `apps/server/src/auth/routes.ts`
- Create: `apps/server/tests/auth-login.test.ts`

- [ ] **Step 1: Write the failing test**

Write to `apps/server/tests/auth-login.test.ts`:

```ts
import { describe, it, expect, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeTestApp } from "./helpers/app.js";
import { createTestUser } from "./helpers/fixtures.js";
import { disconnectDb } from "./helpers/db.js";

describe("POST /auth/login", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });
  afterAll(async () => {
    await disconnectDb();
  });

  it("returns a token for correct credentials", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: user.email, password: user.password },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toEqual(expect.any(String));
    expect(body.user.id).toBe(user.id);
  });

  it("rejects wrong password", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: user.email, password: "wrong-password-01" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("AUTH_ERROR");
  });

  it("rejects unknown email with the same 401 shape (no enumeration)", async () => {
    app = await makeTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@nowhere.com", password: "anything12345" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("AUTH_ERROR");
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --filter @redvoice/server test tests/auth-login.test.ts`
Expected: FAIL (404).

- [ ] **Step 3: Add the login handler to `auth/routes.ts`**

Replace the contents of `apps/server/src/auth/routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { getConfig } from "../config.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signSessionToken } from "./jwt.js";
import { AuthError, ConflictError, ValidationError } from "../errors.js";

const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, "password must be at least 12 characters"),
  displayName: z.string().min(1).max(50),
});

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (request, reply) => {
    const parsed = registerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "invalid input");
    }
    const { email, password, displayName } = parsed.data;
    const passwordHash = await hashPassword(password);
    let user;
    try {
      user = await prisma.user.create({
        data: { email, displayName, passwordHash },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("email already registered");
      }
      throw err;
    }
    const session = await prisma.session.create({ data: { userId: user.id } });
    const token = signSessionToken(
      { userId: user.id, sessionId: session.id },
      getConfig().JWT_SECRET,
    );
    reply.status(201).send({
      token,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("invalid input");
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AuthError("invalid credentials");
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      throw new AuthError("invalid credentials");
    }

    const session = await prisma.session.create({ data: { userId: user.id } });
    const token = signSessionToken(
      { userId: user.id, sessionId: session.id },
      getConfig().JWT_SECRET,
    );
    reply.status(200).send({
      token,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
  });
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @redvoice/server test tests/auth-login.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/auth/routes.ts apps/server/tests/auth-login.test.ts
git commit -m "feat(server): POST /auth/login"
```

---

## Task 11: Auth middleware + /me + /auth/logout

**Files:**
- Create: `apps/server/src/auth/middleware.ts`
- Modify: `apps/server/src/auth/routes.ts`
- Create: `apps/server/tests/auth-middleware.test.ts`
- Create: `apps/server/tests/me-and-logout.test.ts`

- [ ] **Step 1: Write the middleware test**

Write to `apps/server/tests/auth-middleware.test.ts`:

```ts
import { describe, it, expect, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeTestApp } from "./helpers/app.js";
import { createTestUser } from "./helpers/fixtures.js";
import { disconnectDb } from "./helpers/db.js";

describe("requireAuth middleware (via /me)", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });
  afterAll(async () => {
    await disconnectDb();
  });

  it("401s with no Authorization header", async () => {
    app = await makeTestApp();
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
  });

  it("401s with a malformed Authorization header", async () => {
    app = await makeTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "NotBearer nope" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("401s with a bogus token", async () => {
    app = await makeTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer nope.nope.nope" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("200s with a valid token", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: user.email, password: user.password },
    });
    const { token } = login.json();
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().email).toBe(user.email);
  });
});
```

- [ ] **Step 2: Write the /me and /logout test**

Write to `apps/server/tests/me-and-logout.test.ts`:

```ts
import { describe, it, expect, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeTestApp } from "./helpers/app.js";
import { createTestUser } from "./helpers/fixtures.js";
import { disconnectDb } from "./helpers/db.js";

async function login(app: FastifyInstance, email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  return res.json().token;
}

describe("GET /me and POST /auth/logout", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });
  afterAll(async () => {
    await disconnectDb();
  });

  it("GET /me returns the current user", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const token = await login(app, user.email, user.password);
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    });
  });

  it("POST /auth/logout revokes the session so subsequent /me 401s", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const token = await login(app, user.email, user.password);

    const out = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(out.statusCode).toBe(204);

    const me = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(401);
  });
});
```

- [ ] **Step 3: Run — expect failure**

Run: `pnpm --filter @redvoice/server test tests/auth-middleware.test.ts tests/me-and-logout.test.ts`
Expected: FAIL (no /me, no /logout).

- [ ] **Step 4: Implement the middleware**

Write to `apps/server/src/auth/middleware.ts`:

```ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { getConfig } from "../config.js";
import { AuthError } from "../errors.js";
import { verifySessionToken, type SessionTokenPayload } from "./jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    auth?: {
      userId: string;
      sessionId: string;
    };
  }
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new AuthError("missing bearer token");
  }
  const token = header.slice("Bearer ".length).trim();
  let payload: SessionTokenPayload;
  try {
    payload = verifySessionToken(token, getConfig().JWT_SECRET);
  } catch {
    throw new AuthError("invalid token");
  }
  const session = await prisma.session.findUnique({ where: { id: payload.sessionId } });
  if (!session || session.revokedAt !== null) {
    throw new AuthError("session revoked");
  }
  request.auth = { userId: payload.userId, sessionId: payload.sessionId };
}
```

- [ ] **Step 5: Add /me and /auth/logout to `auth/routes.ts`**

Replace the entire contents of `apps/server/src/auth/routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { getConfig } from "../config.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signSessionToken } from "./jwt.js";
import { requireAuth } from "./middleware.js";
import { AuthError, ConflictError, ValidationError } from "../errors.js";

const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, "password must be at least 12 characters"),
  displayName: z.string().min(1).max(50),
});

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (request, reply) => {
    const parsed = registerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "invalid input");
    }
    const { email, password, displayName } = parsed.data;
    const passwordHash = await hashPassword(password);
    let user;
    try {
      user = await prisma.user.create({
        data: { email, displayName, passwordHash },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("email already registered");
      }
      throw err;
    }
    const session = await prisma.session.create({ data: { userId: user.id } });
    const token = signSessionToken(
      { userId: user.id, sessionId: session.id },
      getConfig().JWT_SECRET,
    );
    reply.status(201).send({
      token,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("invalid input");
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AuthError("invalid credentials");
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      throw new AuthError("invalid credentials");
    }

    const session = await prisma.session.create({ data: { userId: user.id } });
    const token = signSessionToken(
      { userId: user.id, sessionId: session.id },
      getConfig().JWT_SECRET,
    );
    reply.status(200).send({
      token,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
  });

  app.get("/me", { preHandler: requireAuth }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.auth!.userId } });
    if (!user) throw new AuthError("user not found");
    return { id: user.id, email: user.email, displayName: user.displayName };
  });

  app.post("/auth/logout", { preHandler: requireAuth }, async (request, reply) => {
    await prisma.session.update({
      where: { id: request.auth!.sessionId },
      data: { revokedAt: new Date() },
    });
    reply.status(204).send();
  });
}
```

- [ ] **Step 6: Run — expect pass**

Run: `pnpm --filter @redvoice/server test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/auth apps/server/tests/auth-middleware.test.ts apps/server/tests/me-and-logout.test.ts
git commit -m "feat(server): requireAuth middleware + GET /me + POST /auth/logout"
```

---

## Task 12: Rooms — create, list, get

**Files:**
- Create: `apps/server/src/rooms/routes.ts`
- Create: `apps/server/tests/rooms.test.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Write the failing tests**

Write to `apps/server/tests/rooms.test.ts`:

```ts
import { describe, it, expect, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeTestApp } from "./helpers/app.js";
import { createTestUser } from "./helpers/fixtures.js";
import { disconnectDb } from "./helpers/db.js";

async function login(app: FastifyInstance, email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  return res.json().token;
}

describe("rooms", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });
  afterAll(async () => {
    await disconnectDb();
  });

  it("POST /rooms creates a room owned by the authenticated user", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const token = await login(app, user.email, user.password);
    const res = await app.inject({
      method: "POST",
      url: "/rooms",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Friday Gaming" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toEqual(expect.any(String));
    expect(body.name).toBe("Friday Gaming");
    expect(body.ownerId).toBe(user.id);
    expect(body.isOwner).toBe(true);
  });

  it("POST /rooms rejects empty name", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const token = await login(app, user.email, user.password);
    const res = await app.inject({
      method: "POST",
      url: "/rooms",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /rooms requires auth", async () => {
    app = await makeTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/rooms",
      payload: { name: "Public" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /rooms returns owned and recent rooms split", async () => {
    app = await makeTestApp();
    const alice = await createTestUser();
    const tokenA = await login(app, alice.email, alice.password);
    await app.inject({
      method: "POST",
      url: "/rooms",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: "Alice's Room" },
    });
    const res = await app.inject({
      method: "GET",
      url: "/rooms",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.owned).toHaveLength(1);
    expect(body.owned[0].name).toBe("Alice's Room");
    expect(body.recent).toEqual([]);
  });

  it("GET /rooms/:id returns room metadata; isOwner=false for non-owner", async () => {
    app = await makeTestApp();
    const alice = await createTestUser();
    const bob = await createTestUser();
    const tokenA = await login(app, alice.email, alice.password);
    const create = await app.inject({
      method: "POST",
      url: "/rooms",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: "A" },
    });
    const roomId = create.json().id;
    const tokenB = await login(app, bob.email, bob.password);
    const res = await app.inject({
      method: "GET",
      url: `/rooms/${roomId}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(roomId);
    expect(body.isOwner).toBe(false);
    expect(body.lastJoined).toBeNull();
  });

  it("GET /rooms/:id 404s for unknown room", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const token = await login(app, user.email, user.password);
    const res = await app.inject({
      method: "GET",
      url: "/rooms/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --filter @redvoice/server test tests/rooms.test.ts`
Expected: FAIL (no /rooms routes).

- [ ] **Step 3: Implement `rooms/routes.ts`**

Write to `apps/server/src/rooms/routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth/middleware.js";
import { NotFoundError, ValidationError } from "../errors.js";
import type { Room, RoomMembership } from "@prisma/client";

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

interface RoomResponse {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  isOwner: boolean;
  lastJoined: string | null;
}

function toResponse(
  room: Room,
  currentUserId: string,
  membership: RoomMembership | null,
): RoomResponse {
  return {
    id: room.id,
    name: room.name,
    ownerId: room.ownerId,
    createdAt: room.createdAt.toISOString(),
    isOwner: room.ownerId === currentUserId,
    lastJoined: membership ? membership.lastJoined.toISOString() : null,
  };
}

export async function roomRoutes(app: FastifyInstance): Promise<void> {
  app.post("/rooms", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createRoomSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "invalid input");
    }
    const room = await prisma.room.create({
      data: { name: parsed.data.name, ownerId: request.auth!.userId },
    });
    reply.status(201).send(toResponse(room, request.auth!.userId, null));
  });

  app.get("/rooms", { preHandler: requireAuth }, async (request) => {
    const userId = request.auth!.userId;
    const [owned, memberships] = await Promise.all([
      prisma.room.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "desc" } }),
      prisma.roomMembership.findMany({
        where: { userId, room: { ownerId: { not: userId } } },
        include: { room: true },
        orderBy: { lastJoined: "desc" },
      }),
    ]);
    return {
      owned: owned.map((r) => toResponse(r, userId, null)),
      recent: memberships.map((m) => toResponse(m.room, userId, m)),
    };
  });

  app.get<{ Params: { id: string } }>(
    "/rooms/:id",
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth!.userId;
      const room = await prisma.room.findUnique({ where: { id: request.params.id } });
      if (!room) throw new NotFoundError("room not found");
      const membership = await prisma.roomMembership.findUnique({
        where: { userId_roomId: { userId, roomId: room.id } },
      });
      return toResponse(room, userId, membership);
    },
  );
}
```

- [ ] **Step 4: Wire rooms into `app.ts`**

Replace the contents of `apps/server/src/app.ts`:

```ts
import Fastify, { type FastifyInstance } from "fastify";
import { registerErrorHandler } from "./errors.js";
import { authRoutes } from "./auth/routes.js";
import { roomRoutes } from "./rooms/routes.js";

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    disableRequestLogging: true,
  });

  registerErrorHandler(app);

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(authRoutes);
  await app.register(roomRoutes);

  return app;
}
```

- [ ] **Step 5: Run — expect pass**

Run: `pnpm --filter @redvoice/server test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/rooms apps/server/src/app.ts apps/server/tests/rooms.test.ts
git commit -m "feat(server): rooms CRUD (create, list, get)"
```

---

## Task 13: LiveKit token endpoint

**Files:**
- Create: `apps/server/src/livekit.ts`
- Modify: `apps/server/src/rooms/routes.ts`
- Create: `apps/server/tests/token.test.ts`

- [ ] **Step 1: Write the failing test**

Write to `apps/server/tests/token.test.ts`:

```ts
import { describe, it, expect, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { makeTestApp } from "./helpers/app.js";
import { createTestUser } from "./helpers/fixtures.js";
import { disconnectDb } from "./helpers/db.js";
import { prisma } from "../src/db.js";

async function login(app: FastifyInstance, email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  return res.json().token;
}

async function createRoom(app: FastifyInstance, token: string, name: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/rooms",
    headers: { authorization: `Bearer ${token}` },
    payload: { name },
  });
  return res.json().id;
}

describe("POST /rooms/:id/token", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });
  afterAll(async () => {
    await disconnectDb();
  });

  it("mints a LiveKit token for a valid room + user", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const session = await login(app, user.email, user.password);
    const roomId = await createRoom(app, session, "Test Room");

    const res = await app.inject({
      method: "POST",
      url: `/rooms/${roomId}/token`,
      headers: { authorization: `Bearer ${session}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toEqual(expect.any(String));
    expect(body.url).toMatch(/^wss?:\/\//);
    expect(body.roomId).toBe(roomId);

    // Decode the LiveKit token and verify basic claims.
    const decoded = jwt.verify(body.token, "y".repeat(32)) as Record<string, unknown>;
    expect(decoded.sub).toBe(user.id);
    expect(decoded.name).toBe(user.displayName);
    expect((decoded.video as { room: string }).room).toBe(roomId);
    expect((decoded.video as { canPublish: boolean }).canPublish).toBe(true);
    expect((decoded.video as { canSubscribe: boolean }).canSubscribe).toBe(true);
  });

  it("creates a RoomMembership row on first token fetch", async () => {
    app = await makeTestApp();
    const owner = await createTestUser();
    const visitor = await createTestUser();
    const tokenOwner = await login(app, owner.email, owner.password);
    const roomId = await createRoom(app, tokenOwner, "Owned");
    const tokenVisitor = await login(app, visitor.email, visitor.password);

    await app.inject({
      method: "POST",
      url: `/rooms/${roomId}/token`,
      headers: { authorization: `Bearer ${tokenVisitor}` },
    });

    const membership = await prisma.roomMembership.findUnique({
      where: { userId_roomId: { userId: visitor.id, roomId } },
    });
    expect(membership).not.toBeNull();
  });

  it("updates lastJoined on subsequent token fetches", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const token = await login(app, user.email, user.password);
    const roomId = await createRoom(app, token, "R");

    await app.inject({
      method: "POST",
      url: `/rooms/${roomId}/token`,
      headers: { authorization: `Bearer ${token}` },
    });
    const first = await prisma.roomMembership.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    });
    await new Promise((r) => setTimeout(r, 10));
    await app.inject({
      method: "POST",
      url: `/rooms/${roomId}/token`,
      headers: { authorization: `Bearer ${token}` },
    });
    const second = await prisma.roomMembership.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    });
    expect(second!.lastJoined.getTime()).toBeGreaterThanOrEqual(first!.lastJoined.getTime());
  });

  it("404s for unknown room", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const token = await login(app, user.email, user.password);
    const res = await app.inject({
      method: "POST",
      url: "/rooms/00000000-0000-0000-0000-000000000000/token",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("requires auth", async () => {
    app = await makeTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/rooms/any/token",
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --filter @redvoice/server test tests/token.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `livekit.ts`**

Write to `apps/server/src/livekit.ts`:

```ts
import { AccessToken } from "livekit-server-sdk";
import { getConfig } from "./config.js";

export interface MintArgs {
  userId: string;
  displayName: string;
  roomId: string;
}

export async function mintLiveKitToken(args: MintArgs): Promise<string> {
  const cfg = getConfig();
  const at = new AccessToken(cfg.LIVEKIT_API_KEY, cfg.LIVEKIT_API_SECRET, {
    identity: args.userId,
    name: args.displayName,
    ttl: 60 * 60, // 1 hour
  });
  at.addGrant({
    room: args.roomId,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return at.toJwt();
}
```

- [ ] **Step 4: Add the token endpoint to `rooms/routes.ts`**

Replace the contents of `apps/server/src/rooms/routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth/middleware.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { mintLiveKitToken } from "../livekit.js";
import { getConfig } from "../config.js";
import type { Room, RoomMembership } from "@prisma/client";

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

interface RoomResponse {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  isOwner: boolean;
  lastJoined: string | null;
}

function toResponse(
  room: Room,
  currentUserId: string,
  membership: RoomMembership | null,
): RoomResponse {
  return {
    id: room.id,
    name: room.name,
    ownerId: room.ownerId,
    createdAt: room.createdAt.toISOString(),
    isOwner: room.ownerId === currentUserId,
    lastJoined: membership ? membership.lastJoined.toISOString() : null,
  };
}

export async function roomRoutes(app: FastifyInstance): Promise<void> {
  app.post("/rooms", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createRoomSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "invalid input");
    }
    const room = await prisma.room.create({
      data: { name: parsed.data.name, ownerId: request.auth!.userId },
    });
    reply.status(201).send(toResponse(room, request.auth!.userId, null));
  });

  app.get("/rooms", { preHandler: requireAuth }, async (request) => {
    const userId = request.auth!.userId;
    const [owned, memberships] = await Promise.all([
      prisma.room.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "desc" } }),
      prisma.roomMembership.findMany({
        where: { userId, room: { ownerId: { not: userId } } },
        include: { room: true },
        orderBy: { lastJoined: "desc" },
      }),
    ]);
    return {
      owned: owned.map((r) => toResponse(r, userId, null)),
      recent: memberships.map((m) => toResponse(m.room, userId, m)),
    };
  });

  app.get<{ Params: { id: string } }>(
    "/rooms/:id",
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth!.userId;
      const room = await prisma.room.findUnique({ where: { id: request.params.id } });
      if (!room) throw new NotFoundError("room not found");
      const membership = await prisma.roomMembership.findUnique({
        where: { userId_roomId: { userId, roomId: room.id } },
      });
      return toResponse(room, userId, membership);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/rooms/:id/token",
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth!.userId;
      const room = await prisma.room.findUnique({ where: { id: request.params.id } });
      if (!room) throw new NotFoundError("room not found");

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundError("user not found");

      // Upsert membership, setting lastJoined to now
      await prisma.roomMembership.upsert({
        where: { userId_roomId: { userId, roomId: room.id } },
        create: { userId, roomId: room.id, lastJoined: new Date() },
        update: { lastJoined: new Date() },
      });

      const token = await mintLiveKitToken({
        userId: user.id,
        displayName: user.displayName,
        roomId: room.id,
      });

      return {
        token,
        url: getConfig().LIVEKIT_URL,
        roomId: room.id,
      };
    },
  );
}
```

- [ ] **Step 5: Run — expect pass**

Run: `pnpm --filter @redvoice/server test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/livekit.ts apps/server/src/rooms/routes.ts apps/server/tests/token.test.ts
git commit -m "feat(server): POST /rooms/:id/token mints LiveKit JWT, upserts membership"
```

---

## Task 14: Rate limiting on register

**Files:**
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/auth/routes.ts`
- Create: `apps/server/tests/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

Write to `apps/server/tests/rate-limit.test.ts`:

```ts
import { describe, it, expect, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeTestApp } from "./helpers/app.js";
import { disconnectDb } from "./helpers/db.js";

describe("POST /auth/register rate limit", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });
  afterAll(async () => {
    await disconnectDb();
  });

  it("429s after 5 registrations from the same IP within the window", async () => {
    app = await makeTestApp();
    // Using a fixed IP header the test rate-limit config will honor
    for (let i = 0; i < 5; i += 1) {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        headers: { "x-forwarded-for": "1.2.3.4" },
        payload: {
          email: `rl${i}@test.local`,
          password: "longenough-pw-123",
          displayName: `rl${i}`,
        },
      });
      expect([201, 409]).toContain(res.statusCode);
    }
    const sixth = await app.inject({
      method: "POST",
      url: "/auth/register",
      headers: { "x-forwarded-for": "1.2.3.4" },
      payload: {
        email: `rl-over@test.local`,
        password: "longenough-pw-123",
        displayName: `over`,
      },
    });
    expect(sixth.statusCode).toBe(429);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --filter @redvoice/server test tests/rate-limit.test.ts`
Expected: FAIL (the 6th returns 201, not 429).

- [ ] **Step 3: Wire `@fastify/rate-limit` plugin and trust proxy**

Replace the contents of `apps/server/src/app.ts`:

```ts
import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { registerErrorHandler } from "./errors.js";
import { authRoutes } from "./auth/routes.js";
import { roomRoutes } from "./rooms/routes.js";

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    disableRequestLogging: true,
    trustProxy: true,
  });

  await app.register(rateLimit, { global: false });

  registerErrorHandler(app);

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(authRoutes);
  await app.register(roomRoutes);

  return app;
}
```

- [ ] **Step 4: Apply rate limit to the register handler**

Replace the entire contents of `apps/server/src/auth/routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { getConfig } from "../config.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signSessionToken } from "./jwt.js";
import { requireAuth } from "./middleware.js";
import { AuthError, ConflictError, ValidationError } from "../errors.js";

const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, "password must be at least 12 characters"),
  displayName: z.string().min(1).max(50),
});

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/auth/register",
    {
      config: {
        rateLimit: { max: 5, timeWindow: "1 hour" },
      },
    },
    async (request, reply) => {
      const parsed = registerBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? "invalid input");
      }
      const { email, password, displayName } = parsed.data;
      const passwordHash = await hashPassword(password);
      let user;
      try {
        user = await prisma.user.create({
          data: { email, displayName, passwordHash },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new ConflictError("email already registered");
        }
        throw err;
      }
      const session = await prisma.session.create({ data: { userId: user.id } });
      const token = signSessionToken(
        { userId: user.id, sessionId: session.id },
        getConfig().JWT_SECRET,
      );
      reply.status(201).send({
        token,
        user: { id: user.id, email: user.email, displayName: user.displayName },
      });
    },
  );

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("invalid input");
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AuthError("invalid credentials");
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      throw new AuthError("invalid credentials");
    }

    const session = await prisma.session.create({ data: { userId: user.id } });
    const token = signSessionToken(
      { userId: user.id, sessionId: session.id },
      getConfig().JWT_SECRET,
    );
    reply.status(200).send({
      token,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
  });

  app.get("/me", { preHandler: requireAuth }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.auth!.userId } });
    if (!user) throw new AuthError("user not found");
    return { id: user.id, email: user.email, displayName: user.displayName };
  });

  app.post("/auth/logout", { preHandler: requireAuth }, async (request, reply) => {
    await prisma.session.update({
      where: { id: request.auth!.sessionId },
      data: { revokedAt: new Date() },
    });
    reply.status(204).send();
  });
}
```

- [ ] **Step 5: Run — expect pass**

Run: `pnpm --filter @redvoice/server test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/app.ts apps/server/src/auth/routes.ts apps/server/tests/rate-limit.test.ts
git commit -m "feat(server): rate-limit register to 5/hour/IP"
```

---

## Task 15: CI workflow + final README

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`

- [ ] **Step 1: Create CI workflow**

Write to `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  server:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @redvoice/server prisma generate
      - run: pnpm --filter @redvoice/server prisma migrate deploy
        env:
          DATABASE_URL: "file:./dev.db"
      - run: pnpm --filter @redvoice/shared build
      - run: pnpm -r typecheck
      - run: pnpm --filter @redvoice/server test
        # Note: vitest.config.ts injects its own env block for tests, which
        # overrides any env we set here. This block is only for the migrate
        # step above. Keep vitest.config.ts in sync if you change secrets.
```

- [ ] **Step 2: Expand `README.md`**

Replace the contents of `README.md`:

```markdown
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
```

- [ ] **Step 3: Create `.env.example` for self-hosters**

Write to `apps/server/.env.example`:

```
# Copy to apps/server/.env and fill in real values.
DATABASE_URL="file:./dev.db"

# Generate: `openssl rand -base64 32`
JWT_SECRET="replace-me-min-32-chars-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

# LiveKit server — point at your running livekit-server
LIVEKIT_URL="ws://localhost:7880"
LIVEKIT_API_KEY="devkey"
LIVEKIT_API_SECRET="replace-me-min-32-chars-bbbbbbbbbbbbbbbbbbbbbbbbb"
```

- [ ] **Step 4: Run everything locally to confirm the whole suite is green**

Run: `pnpm -r typecheck && pnpm --filter @redvoice/server test`
Expected: all checks pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml README.md apps/server/.env.example
git commit -m "chore: GitHub Actions CI + README + .env.example"
```

---

## Done — Plan 1 acceptance checklist

Before declaring Plan 1 complete, verify each of these manually:

- [ ] `pnpm -r typecheck` green
- [ ] `pnpm --filter @redvoice/server test` green (all tests)
- [ ] `pnpm server:dev` starts the server on port 3000, no errors
- [ ] `curl http://localhost:3000/health` returns `{"status":"ok"}`
- [ ] End-to-end curl flow works:
  - Register a user → get token
  - Login → get token
  - Create a room with that token → get room id
  - Fetch `/rooms/:id/token` → get LiveKit JWT
  - Logout → subsequent `/me` returns 401
- [ ] CI workflow runs green on a PR

Once all boxes are checked, move on to Plan 2 (Infra + Client Foundation).
