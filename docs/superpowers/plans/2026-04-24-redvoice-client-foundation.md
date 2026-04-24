# RedVoice Plan 2 — Client Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Electron desktop client foundation with Login/Register and Lobby screens, wired to the Plan 1 app-server HTTP API. End state: a user can install the app, register/login, create and list rooms, join-by-link (route to a placeholder "pre-join" screen — actual pre-join UX lands in Plan 3), and log out. No media/LiveKit integration yet.

**Architecture:** Electron + React + TypeScript, scaffolded via `electron-vite`. Three process types: **main** (Node context, handles window lifecycle and OS keychain via `safeStorage`), **preload** (bridge that exposes a narrow typed API via `contextBridge.exposeInMainWorld`), and **renderer** (React app running in Chromium). JWTs stored encrypted on disk via Electron `safeStorage`, never touching `localStorage`. State managed with Zustand; no React Router (two-screen state machine is driven by auth state). UI is intentionally minimal — the distinctive `frontend-design` pass is Plan 4.

**Tech Stack:** Electron 35, electron-vite 3, React 19, TypeScript 5, Zustand 5, Vitest 2, Node ≥20, pnpm 9.

**Spec reference:** `docs/superpowers/specs/2026-04-24-redvoice-design.md` (Section "Client Screens" items 1-2; auth flow section).

**Plan 1 dependency:** This plan assumes `apps/server` (from Plan 1) is running locally at `http://localhost:3000` for manual smoke testing. All tests use mocked fetch, so the server doesn't need to be running for `pnpm test`.

---

## File Structure

```
apps/client/
├── package.json
├── tsconfig.json                     # workspace-style references (root)
├── tsconfig.node.json                # for main/preload (Node context)
├── tsconfig.web.json                 # for renderer (browser context)
├── electron.vite.config.ts           # electron-vite bundler config
├── vitest.config.ts
├── .gitignore                        # extends root; ignore out/, release/
│
├── src/
│   ├── main/
│   │   ├── index.ts                  # BrowserWindow + app lifecycle
│   │   └── token-store.ts            # safeStorage-backed JWT persistence
│   ├── preload/
│   │   └── index.ts                  # contextBridge exposure
│   ├── shared/
│   │   └── bridge-types.ts           # RedVoiceBridge type (shared between preload + renderer)
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx              # React mount
│           ├── App.tsx               # chooses screen by auth state
│           ├── env.d.ts              # window.redvoice typing
│           ├── styles.css            # minimal dark theme
│           ├── lib/
│           │   ├── api.ts            # HTTP client for app-server
│           │   └── auth-store.ts     # Zustand auth store
│           └── screens/
│               ├── LoginScreen.tsx
│               └── LobbyScreen.tsx
└── tests/
    ├── api.test.ts
    └── auth-store.test.ts
```

**Decomposition notes:**
- Main, preload, and renderer code live in three separate folders so each runs through its own tsconfig (different libs: node vs. dom). Sharing types goes through `src/shared/`.
- `lib/` vs. `screens/` split: `lib` is pure-logic (testable), `screens` is React components (not tested in MVP).
- `token-store.ts` is isolated from `main/index.ts` so it can later be reused (e.g., by a future settings IPC handler).

---

## Task 1: Scaffold `apps/client` package

**Files:**
- Create: `apps/client/package.json`
- Create: `apps/client/tsconfig.json`
- Create: `apps/client/tsconfig.node.json`
- Create: `apps/client/tsconfig.web.json`
- Create: `apps/client/electron.vite.config.ts`
- Create: `apps/client/vitest.config.ts`
- Create: `apps/client/.gitignore`

- [ ] **Step 1: Create `apps/client/package.json`**

```json
{
  "name": "@redvoice/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "typecheck": "tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@redvoice/shared": "workspace:*",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^35.0.0",
    "electron-vite": "^3.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `apps/client/tsconfig.json` (references both sub-configs)**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [ ] **Step 3: Create `apps/client/tsconfig.node.json` (main + preload)**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "out/types-node",
    "types": ["node", "electron"],
    "moduleResolution": "NodeNext",
    "module": "NodeNext"
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*", "electron.vite.config.ts"]
}
```

- [ ] **Step 4: Create `apps/client/tsconfig.web.json` (renderer + tests)**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "out/types-web",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["vite/client"]
  },
  "include": ["src/renderer/**/*", "src/shared/**/*", "tests/**/*"]
}
```

- [ ] **Step 5: Create `apps/client/electron.vite.config.ts`**

```ts
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve("src/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve("src/preload/index.ts") },
      },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve("src/renderer/index.html"),
      },
    },
  },
});
```

- [ ] **Step 6: Create `apps/client/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 5_000,
  },
});
```

- [ ] **Step 7: Create `apps/client/.gitignore`**

```
out/
dist/
release/
*.log
```

- [ ] **Step 8: Install deps**

Run: `pnpm install` from `/var/home/red/Projects/RedVoice/`.
Expected: all deps resolve. `apps/client/node_modules` populated. Electron postinstall downloads the Electron binary (~80MB); may take a minute.

If electron download fails (network/proxy), report BLOCKED — don't retry forever.

- [ ] **Step 9: Commit**

```bash
git add apps/client/package.json apps/client/tsconfig.json apps/client/tsconfig.node.json apps/client/tsconfig.web.json apps/client/electron.vite.config.ts apps/client/vitest.config.ts apps/client/.gitignore pnpm-lock.yaml
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "chore(client): scaffold Electron+React app package"
```

---

## Task 2: Main process + token store

**Files:**
- Create: `apps/client/src/shared/bridge-types.ts`
- Create: `apps/client/src/main/token-store.ts`
- Create: `apps/client/src/main/index.ts`

- [ ] **Step 1: Create `src/shared/bridge-types.ts`**

```ts
// Typed interface for the window.redvoice bridge exposed to the renderer.
// Kept in shared/ so both preload (exposes it) and renderer (consumes it) agree.

export interface RedVoiceBridge {
  /** Store a session token encrypted at rest via Electron safeStorage. */
  saveToken(token: string): Promise<void>;
  /** Retrieve the stored session token, or null if none/undecryptable. */
  getToken(): Promise<string | null>;
  /** Remove the stored session token. */
  clearToken(): Promise<void>;
  /** Platform string: "darwin" | "linux" | "win32". */
  platform(): string;
}
```

- [ ] **Step 2: Create `src/main/token-store.ts`**

```ts
import { safeStorage, app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";

const FILENAME = "session.enc";

function tokenPath(): string {
  return join(app.getPath("userData"), FILENAME);
}

export async function saveToken(token: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS keychain unavailable; cannot persist session securely");
  }
  const encrypted = safeStorage.encryptString(token);
  await fs.writeFile(tokenPath(), encrypted);
}

export async function getToken(): Promise<string | null> {
  try {
    const bytes = await fs.readFile(tokenPath());
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(bytes);
  } catch (err: unknown) {
    // File missing or decryption failed — treat as "no session"
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

export async function clearToken(): Promise<void> {
  await fs.rm(tokenPath(), { force: true });
}
```

- [ ] **Step 3: Create `src/main/index.ts`**

```ts
import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { saveToken, getToken, clearToken } from "./token-store.js";

// electron-vite exposes MAIN_VITE / RENDERER_VITE_* envs; these are the standard names.
const RENDERER_DEV_URL = process.env["ELECTRON_RENDERER_URL"];

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#101014",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (RENDERER_DEV_URL) {
    await win.loadURL(RENDERER_DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle("auth:save-token", async (_event, token: unknown) => {
    if (typeof token !== "string") throw new Error("invalid token");
    await saveToken(token);
  });
  ipcMain.handle("auth:get-token", async () => getToken());
  ipcMain.handle("auth:clear-token", async () => clearToken());
  ipcMain.handle("app:platform", () => process.platform);
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/shared apps/client/src/main
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): main process with safeStorage-backed token store"
```

---

## Task 3: Preload bridge

**Files:**
- Create: `apps/client/src/preload/index.ts`

- [ ] **Step 1: Create `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from "electron";
import type { RedVoiceBridge } from "../shared/bridge-types.js";

const bridge: RedVoiceBridge = {
  saveToken: (token) => ipcRenderer.invoke("auth:save-token", token),
  getToken: () => ipcRenderer.invoke("auth:get-token"),
  clearToken: () => ipcRenderer.invoke("auth:clear-token"),
  platform: () => process.platform,
};

contextBridge.exposeInMainWorld("redvoice", bridge);
```

- [ ] **Step 2: Typecheck the main + preload side**

Run from project root: `pnpm --filter @redvoice/client exec tsc -p tsconfig.node.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/preload
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): preload bridge via contextBridge"
```

---

## Task 4: Renderer base shell

**Files:**
- Create: `apps/client/src/renderer/index.html`
- Create: `apps/client/src/renderer/src/env.d.ts`
- Create: `apps/client/src/renderer/src/main.tsx`
- Create: `apps/client/src/renderer/src/App.tsx`
- Create: `apps/client/src/renderer/src/styles.css`

- [ ] **Step 1: Create `src/renderer/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>RedVoice</title>
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://localhost:* ws://localhost:* https: wss:; img-src 'self' data:;"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/renderer/src/env.d.ts`**

```ts
import type { RedVoiceBridge } from "../../shared/bridge-types.js";

declare global {
  interface Window {
    redvoice: RedVoiceBridge;
  }
}

export {};
```

- [ ] **Step 3: Create `src/renderer/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 4: Create a placeholder `src/renderer/src/App.tsx`**

```tsx
export function App(): JSX.Element {
  return (
    <div className="app">
      <h1>RedVoice</h1>
      <p>Client loading…</p>
    </div>
  );
}
```

- [ ] **Step 5: Create `src/renderer/src/styles.css`** (minimal dark theme — final polish is Plan 4)

```css
:root {
  color-scheme: dark;
  --bg: #101014;
  --bg-elev: #17171d;
  --border: #2a2a32;
  --text: #e6e6ec;
  --text-dim: #8a8a96;
  --accent: #d63850;
  --accent-hover: #e74d65;
  --error: #ff6b6b;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
}

* {
  box-sizing: border-box;
}

body,
html,
#root {
  margin: 0;
  padding: 0;
  height: 100%;
  background: var(--bg);
  color: var(--text);
}

.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* Forms */
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 360px;
}

.form input,
.form select {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 10px 12px;
  border-radius: 6px;
  font: inherit;
}

.form input:focus {
  outline: none;
  border-color: var(--accent);
}

.btn {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 10px 16px;
  border-radius: 6px;
  font: inherit;
  cursor: pointer;
}

.btn:hover {
  background: var(--accent-hover);
}

.btn.secondary {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
}

.tabs button {
  background: transparent;
  border: none;
  color: var(--text-dim);
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.tabs button.active {
  color: var(--text);
  border-bottom-color: var(--accent);
}

.error {
  color: var(--error);
  font-size: 13px;
}

/* Centered container used by Login */
.centered {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

/* Lobby layout */
.lobby {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 24px;
  padding: 24px;
  flex: 1;
  min-height: 0;
}

.lobby aside {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  overflow-y: auto;
}

.lobby main {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  margin: 16px 0 8px;
}

.room-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.room-list li button {
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: var(--text);
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
}

.room-list li button:hover {
  background: var(--border);
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elev);
}
```

- [ ] **Step 6: Smoke test the dev build**

Run: `pnpm --filter @redvoice/client dev`
Expected: Electron window appears showing "RedVoice" + "Client loading…". DevTools open in detached mode.

If the app crashes or the window doesn't open, inspect the terminal output and report BLOCKED with the exact error. Common issues:
- Missing preload (fix typoed path in `main/index.ts`)
- CSP violations (open DevTools Console)
- electron-vite build config wrong (compare to Task 1 Step 5)

Close the window to stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/renderer
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): renderer shell (React 19 + dark theme)"
```

---

## Task 5: HTTP API client with tests

**Files:**
- Create: `apps/client/src/renderer/src/lib/api.ts`
- Create: `apps/client/tests/api.test.ts`

**Context:** The API client is a thin fetch wrapper that:
- Takes a `serverUrl` (configurable — defaults to `http://localhost:3000`)
- Takes an optional session token; if present, adds `Authorization: Bearer <token>`
- Returns a typed response or throws an `ApiError` with a `code` and `message`
- Handles the `{ error: { code, message } }` shape the server returns for non-2xx

- [ ] **Step 1: Write the failing tests**

Write to `apps/client/tests/api.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ApiClient, ApiError } from "../src/renderer/src/lib/api.js";

const BASE = "http://localhost:3000";

describe("ApiClient", () => {
  const originalFetch = globalThis.fetch;
  const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("attaches Authorization header when token is set", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: "u1", email: "a@b.com", displayName: "a" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new ApiClient(BASE);
    client.setToken("sekrit");
    await client.me();
    const [, init] = mockFetch.mock.calls[0]!;
    expect((init?.headers as Record<string, string>)["authorization"]).toBe("Bearer sekrit");
  });

  it("omits Authorization when no token is set", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ token: "t", user: { id: "u", email: "a@b.com", displayName: "a" } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new ApiClient(BASE);
    await client.register({ email: "a@b.com", password: "longenough-pw1", displayName: "a" });
    const [, init] = mockFetch.mock.calls[0]!;
    expect((init?.headers as Record<string, string>)["authorization"]).toBeUndefined();
  });

  it("parses structured error responses", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "CONFLICT", message: "email already registered" } }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new ApiClient(BASE);
    await expect(
      client.register({ email: "a@b.com", password: "longenough-pw1", displayName: "a" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "email already registered",
      status: 409,
    });
  });

  it("wraps network failures as ApiError with code=NETWORK", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const client = new ApiClient(BASE);
    const err = await client
      .register({ email: "a@b.com", password: "longenough-pw1", displayName: "a" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("NETWORK");
  });

  it("POST /rooms sends the correct body", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "r1",
          name: "G",
          ownerId: "u1",
          createdAt: new Date().toISOString(),
          isOwner: true,
          lastJoined: null,
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new ApiClient(BASE);
    client.setToken("t");
    await client.createRoom({ name: "G" });
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(String(url)).toBe("http://localhost:3000/rooms");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ name: "G" });
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --filter @redvoice/client test tests/api.test.ts`
Expected: FAIL — cannot find `../src/renderer/src/lib/api.js`.

- [ ] **Step 3: Implement `api.ts`**

Write to `apps/client/src/renderer/src/lib/api.ts`:

```ts
import type {
  AuthResponse,
  CreateRoomRequest,
  LoginRequest,
  RegisterRequest,
  RoomDTO,
  RoomListResponse,
  UserDTO,
  LiveKitTokenResponse,
  ErrorResponse,
} from "@redvoice/shared";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, "");
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  private async request<TBody, TRes>(
    method: "GET" | "POST",
    path: string,
    body?: TBody,
  ): Promise<TRes> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.token) headers["authorization"] = `Bearer ${this.token}`;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new ApiError("NETWORK", err instanceof Error ? err.message : "network error", 0);
    }

    if (response.status === 204) {
      return undefined as TRes;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const payload: unknown = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      if (isJson && payload && typeof payload === "object" && "error" in payload) {
        const err = (payload as ErrorResponse).error;
        throw new ApiError(err.code, err.message, response.status);
      }
      throw new ApiError("HTTP_ERROR", `request failed with ${response.status}`, response.status);
    }

    return payload as TRes;
  }

  // Auth
  register(body: RegisterRequest): Promise<AuthResponse> {
    return this.request("POST", "/auth/register", body);
  }
  login(body: LoginRequest): Promise<AuthResponse> {
    return this.request("POST", "/auth/login", body);
  }
  logout(): Promise<void> {
    return this.request("POST", "/auth/logout");
  }
  me(): Promise<UserDTO> {
    return this.request("GET", "/me");
  }

  // Rooms
  listRooms(): Promise<RoomListResponse> {
    return this.request("GET", "/rooms");
  }
  getRoom(id: string): Promise<RoomDTO> {
    return this.request("GET", `/rooms/${encodeURIComponent(id)}`);
  }
  createRoom(body: CreateRoomRequest): Promise<RoomDTO> {
    return this.request("POST", "/rooms", body);
  }
  mintLiveKitToken(roomId: string): Promise<LiveKitTokenResponse> {
    return this.request("POST", `/rooms/${encodeURIComponent(roomId)}/token`);
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @redvoice/client test tests/api.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/renderer/src/lib/api.ts apps/client/tests/api.test.ts
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): typed HTTP API client with ApiError"
```

---

## Task 6: Auth store (Zustand) with tests

**Files:**
- Create: `apps/client/src/renderer/src/lib/auth-store.ts`
- Create: `apps/client/tests/auth-store.test.ts`

**Context:** Zustand store tracks `{ status: "unauthenticated" | "authenticated" | "loading", user: UserDTO | null, token: string | null, serverUrl: string, error: string | null }`. Actions: `login`, `register`, `logout`, `hydrate` (load token from safeStorage on startup), `setServerUrl`. Store does NOT depend directly on `window.redvoice` — an adapter is passed in, which makes the store testable without Electron.

- [ ] **Step 1: Write the failing tests**

Write to `apps/client/tests/auth-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createAuthStore, type AuthStorageAdapter } from "../src/renderer/src/lib/auth-store.js";
import { ApiClient, ApiError } from "../src/renderer/src/lib/api.js";

function makeAdapter(initial: string | null = null): AuthStorageAdapter & { tokens: (string | null)[] } {
  const tokens: (string | null)[] = [initial];
  return {
    saveToken: async (t) => {
      tokens.push(t);
    },
    getToken: async () => tokens[tokens.length - 1] ?? null,
    clearToken: async () => {
      tokens.push(null);
    },
    tokens,
  };
}

describe("auth store", () => {
  let api: ApiClient;

  beforeEach(() => {
    api = new ApiClient("http://localhost:3000");
    vi.spyOn(api, "login").mockReset();
    vi.spyOn(api, "register").mockReset();
    vi.spyOn(api, "logout").mockReset();
    vi.spyOn(api, "me").mockReset();
  });

  it("starts unauthenticated", () => {
    const store = createAuthStore(api, makeAdapter());
    expect(store.getState().status).toBe("unauthenticated");
    expect(store.getState().token).toBeNull();
    expect(store.getState().user).toBeNull();
  });

  it("login sets authenticated state and persists token", async () => {
    vi.spyOn(api, "login").mockResolvedValue({
      token: "tok",
      user: { id: "u1", email: "a@b.com", displayName: "alice" },
    });
    const adapter = makeAdapter();
    const store = createAuthStore(api, adapter);

    await store.getState().login("a@b.com", "longenough-pw-123");

    expect(store.getState().status).toBe("authenticated");
    expect(store.getState().token).toBe("tok");
    expect(store.getState().user?.displayName).toBe("alice");
    expect(adapter.tokens).toContain("tok");
  });

  it("login with wrong creds sets error and remains unauthenticated", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new ApiError("AUTH_ERROR", "invalid credentials", 401));
    const store = createAuthStore(api, makeAdapter());

    await store.getState().login("a@b.com", "wrong-password-01");

    expect(store.getState().status).toBe("unauthenticated");
    expect(store.getState().error).toBe("invalid credentials");
    expect(store.getState().token).toBeNull();
  });

  it("register sets authenticated state and persists token", async () => {
    vi.spyOn(api, "register").mockResolvedValue({
      token: "tok-r",
      user: { id: "u2", email: "b@c.com", displayName: "bob" },
    });
    const adapter = makeAdapter();
    const store = createAuthStore(api, adapter);

    await store.getState().register("b@c.com", "longenough-pw-123", "bob");

    expect(store.getState().status).toBe("authenticated");
    expect(store.getState().token).toBe("tok-r");
    expect(adapter.tokens).toContain("tok-r");
  });

  it("logout clears state and calls adapter.clearToken", async () => {
    vi.spyOn(api, "logout").mockResolvedValue(undefined);
    const adapter = makeAdapter("existing-token");
    const store = createAuthStore(api, adapter);
    // Seed: pretend we're already logged in
    store.setState({
      status: "authenticated",
      token: "existing-token",
      user: { id: "u1", email: "a@b.com", displayName: "a" },
    });

    await store.getState().logout();

    expect(store.getState().status).toBe("unauthenticated");
    expect(store.getState().token).toBeNull();
    expect(store.getState().user).toBeNull();
    expect(adapter.tokens[adapter.tokens.length - 1]).toBeNull();
  });

  it("hydrate loads existing token and fetches current user", async () => {
    vi.spyOn(api, "me").mockResolvedValue({ id: "u1", email: "a@b.com", displayName: "alice" });
    const store = createAuthStore(api, makeAdapter("persisted-token"));

    await store.getState().hydrate();

    expect(store.getState().status).toBe("authenticated");
    expect(store.getState().token).toBe("persisted-token");
    expect(store.getState().user?.displayName).toBe("alice");
  });

  it("hydrate discards token when /me 401s (revoked)", async () => {
    vi.spyOn(api, "me").mockRejectedValue(new ApiError("AUTH_ERROR", "session revoked", 401));
    const adapter = makeAdapter("stale");
    const store = createAuthStore(api, adapter);

    await store.getState().hydrate();

    expect(store.getState().status).toBe("unauthenticated");
    expect(store.getState().token).toBeNull();
    expect(adapter.tokens[adapter.tokens.length - 1]).toBeNull();
  });

  it("setServerUrl updates both store and api client", () => {
    const store = createAuthStore(api, makeAdapter());
    store.getState().setServerUrl("https://voice.R3dWolfie.com");
    expect(store.getState().serverUrl).toBe("https://voice.R3dWolfie.com");
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --filter @redvoice/client test tests/auth-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the auth store**

Write to `apps/client/src/renderer/src/lib/auth-store.ts`:

```ts
import { createStore, type StoreApi } from "zustand/vanilla";
import type { UserDTO } from "@redvoice/shared";
import { ApiClient, ApiError } from "./api.js";

export interface AuthStorageAdapter {
  saveToken(token: string): Promise<void>;
  getToken(): Promise<string | null>;
  clearToken(): Promise<void>;
}

type AuthStatus = "unauthenticated" | "loading" | "authenticated";

export interface AuthState {
  status: AuthStatus;
  user: UserDTO | null;
  token: string | null;
  serverUrl: string;
  error: string | null;

  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, displayName: string): Promise<void>;
  logout(): Promise<void>;
  hydrate(): Promise<void>;
  setServerUrl(url: string): void;
}

const DEFAULT_SERVER_URL = "http://localhost:3000";

export function createAuthStore(
  api: ApiClient,
  storage: AuthStorageAdapter,
): StoreApi<AuthState> {
  return createStore<AuthState>((set, get) => ({
    status: "unauthenticated",
    user: null,
    token: null,
    serverUrl: DEFAULT_SERVER_URL,
    error: null,

    async login(email, password) {
      set({ status: "loading", error: null });
      try {
        const { token, user } = await api.login({ email, password });
        api.setToken(token);
        await storage.saveToken(token);
        set({ status: "authenticated", token, user, error: null });
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "login failed";
        set({ status: "unauthenticated", error: message });
      }
    },

    async register(email, password, displayName) {
      set({ status: "loading", error: null });
      try {
        const { token, user } = await api.register({ email, password, displayName });
        api.setToken(token);
        await storage.saveToken(token);
        set({ status: "authenticated", token, user, error: null });
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "register failed";
        set({ status: "unauthenticated", error: message });
      }
    },

    async logout() {
      const { token } = get();
      if (token) {
        try {
          await api.logout();
        } catch {
          // Best effort — clear client state regardless of server response
        }
      }
      api.setToken(null);
      await storage.clearToken();
      set({ status: "unauthenticated", token: null, user: null, error: null });
    },

    async hydrate() {
      const persisted = await storage.getToken();
      if (!persisted) {
        set({ status: "unauthenticated" });
        return;
      }
      set({ status: "loading", token: persisted });
      api.setToken(persisted);
      try {
        const user = await api.me();
        set({ status: "authenticated", user, error: null });
      } catch {
        api.setToken(null);
        await storage.clearToken();
        set({ status: "unauthenticated", token: null, user: null });
      }
    },

    setServerUrl(url) {
      const clean = url.replace(/\/$/, "");
      api.setBaseUrl(clean);
      set({ serverUrl: clean });
    },
  }));
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @redvoice/client test`
Expected: all tests (api + auth-store = ~13) pass.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/renderer/src/lib/auth-store.ts apps/client/tests/auth-store.test.ts
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): Zustand auth store with storage adapter"
```

---

## Task 7: React `useAuth` hook + store bootstrap

**Files:**
- Create: `apps/client/src/renderer/src/lib/auth-context.tsx`
- Create: `apps/client/src/renderer/src/lib/bridge-adapter.ts`

**Context:** Zustand-vanilla stores can be used from React via `useSyncExternalStore`. A small `useAuthStore()` hook selects state, and a `AuthProvider` hydrates on mount. The `bridge-adapter.ts` maps the `window.redvoice` bridge to the `AuthStorageAdapter` interface.

- [ ] **Step 1: Create the bridge adapter**

Write to `apps/client/src/renderer/src/lib/bridge-adapter.ts`:

```ts
import type { AuthStorageAdapter } from "./auth-store.js";

/** Bridges window.redvoice (exposed by preload) to AuthStorageAdapter. */
export const bridgeStorageAdapter: AuthStorageAdapter = {
  saveToken: (t) => window.redvoice.saveToken(t),
  getToken: () => window.redvoice.getToken(),
  clearToken: () => window.redvoice.clearToken(),
};
```

- [ ] **Step 2: Create the React context + hook**

Write to `apps/client/src/renderer/src/lib/auth-context.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { StoreApi } from "zustand/vanilla";
import { ApiClient } from "./api.js";
import { createAuthStore, type AuthState } from "./auth-store.js";
import { bridgeStorageAdapter } from "./bridge-adapter.js";

const Ctx = createContext<StoreApi<AuthState> | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const store = useMemo(() => {
    const api = new ApiClient("http://localhost:3000");
    return createAuthStore(api, bridgeStorageAdapter);
  }, []);

  useEffect(() => {
    void store.getState().hydrate();
  }, [store]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useAuthStore<T>(selector: (s: AuthState) => T): T {
  const store = useContext(Ctx);
  if (!store) throw new Error("useAuthStore must be used inside AuthProvider");
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/renderer/src/lib/bridge-adapter.ts apps/client/src/renderer/src/lib/auth-context.tsx
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): React AuthProvider + useAuthStore hook"
```

---

## Task 8: Login / Register screen

**Files:**
- Create: `apps/client/src/renderer/src/screens/LoginScreen.tsx`

- [ ] **Step 1: Create the screen**

Write to `apps/client/src/renderer/src/screens/LoginScreen.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useAuthStore } from "../lib/auth-context.js";

type Mode = "login" | "register";

export function LoginScreen(): JSX.Element {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const serverUrl = useAuthStore((s) => s.serverUrl);
  const setServerUrl = useAuthStore((s) => s.setServerUrl);
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (mode === "login") {
      await login(email, password);
    } else {
      await register(email, password, displayName);
    }
  }

  const busy = status === "loading";

  return (
    <div className="centered">
      <form className="form" onSubmit={onSubmit}>
        <h2 style={{ margin: 0 }}>RedVoice</h2>

        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        <label>
          <div className="section-title">Server</div>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://localhost:3000"
            spellCheck={false}
          />
        </label>

        <label>
          <div className="section-title">Email</div>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        {mode === "register" && (
          <label>
            <div className="section-title">Display name</div>
            <input
              type="text"
              required
              minLength={1}
              maxLength={50}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
        )}

        <label>
          <div className="section-title">Password</div>
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "register" ? 12 : 1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "register" && (
            <div className="section-title" style={{ marginTop: 4, textTransform: "none" }}>
              At least 12 characters.
            </div>
          )}
        </label>

        {error && <div className="error">{error}</div>}

        <button className="btn" type="submit" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/renderer/src/screens/LoginScreen.tsx
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): LoginScreen with login/register tabs"
```

---

## Task 9: Lobby screen (list rooms, create, join-by-link)

**Files:**
- Create: `apps/client/src/renderer/src/lib/rooms-store.ts`
- Create: `apps/client/src/renderer/src/screens/LobbyScreen.tsx`

**Context:** A lightweight rooms store holds `{ owned, recent, status, error }` and exposes `refresh`, `create`, `resolveJoinLink`. Join-by-link accepts either a full URL (`https://voice.R3dWolfie.com/join/<id>`) or a bare UUID. It calls `GET /rooms/:id` to verify the room exists, then routes to a placeholder pre-join view (Plan 3 will replace this).

- [ ] **Step 1: Create `lib/rooms-store.ts`**

Write to `apps/client/src/renderer/src/lib/rooms-store.ts`:

```ts
import { createStore, type StoreApi } from "zustand/vanilla";
import type { RoomDTO } from "@redvoice/shared";
import { ApiClient, ApiError } from "./api.js";

export interface RoomsState {
  owned: RoomDTO[];
  recent: RoomDTO[];
  activeRoomId: string | null; // set when user chooses to join; Plan 3 consumes it
  status: "idle" | "loading" | "ready";
  error: string | null;

  refresh(): Promise<void>;
  create(name: string): Promise<RoomDTO>;
  join(idOrUrl: string): Promise<void>;
  clearActive(): void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractRoomId(input: string): string | null {
  const trimmed = input.trim();
  if (UUID_RE.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/join\/([0-9a-f-]{36})/i);
    if (match && match[1]) return match[1];
  } catch {
    // Not a URL
  }
  return null;
}

export function createRoomsStore(api: ApiClient): StoreApi<RoomsState> {
  return createStore<RoomsState>((set, get) => ({
    owned: [],
    recent: [],
    activeRoomId: null,
    status: "idle",
    error: null,

    async refresh() {
      set({ status: "loading", error: null });
      try {
        const { owned, recent } = await api.listRooms();
        set({ owned, recent, status: "ready" });
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "failed to load rooms";
        set({ status: "ready", error: message });
      }
    },

    async create(name) {
      const room = await api.createRoom({ name });
      const { owned } = get();
      set({ owned: [room, ...owned] });
      return room;
    },

    async join(idOrUrl) {
      const id = extractRoomId(idOrUrl);
      if (!id) {
        set({ error: "That doesn't look like a room link or id." });
        return;
      }
      try {
        const room = await api.getRoom(id);
        set({ activeRoomId: room.id, error: null });
      } catch (err) {
        const message =
          err instanceof ApiError && err.code === "NOT_FOUND"
            ? "Room not found."
            : err instanceof ApiError
              ? err.message
              : "failed to open room";
        set({ error: message });
      }
    },

    clearActive() {
      set({ activeRoomId: null });
    },
  }));
}
```

- [ ] **Step 2: Create the Lobby screen**

Write to `apps/client/src/renderer/src/screens/LobbyScreen.tsx`:

```tsx
import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { ApiClient } from "../lib/api.js";
import { createRoomsStore, type RoomsState } from "../lib/rooms-store.js";
import { useAuthStore } from "../lib/auth-context.js";

function useRoomsStore<T>(store: ReturnType<typeof createRoomsStore>, selector: (s: RoomsState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
}

export function LobbyScreen(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);
  const serverUrl = useAuthStore((s) => s.serverUrl);

  const store = useMemo(() => {
    const api = new ApiClient(serverUrl);
    api.setToken(token);
    return createRoomsStore(api);
  }, [serverUrl, token]);

  const owned = useRoomsStore(store, (s) => s.owned);
  const recent = useRoomsStore(store, (s) => s.recent);
  const status = useRoomsStore(store, (s) => s.status);
  const error = useRoomsStore(store, (s) => s.error);
  const activeRoomId = useRoomsStore(store, (s) => s.activeRoomId);

  useEffect(() => {
    void store.getState().refresh();
  }, [store]);

  const [newRoomName, setNewRoomName] = useState("");
  const [joinInput, setJoinInput] = useState("");

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    await store.getState().create(newRoomName.trim());
    setNewRoomName("");
  }

  async function onJoin(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!joinInput.trim()) return;
    await store.getState().join(joinInput.trim());
  }

  if (activeRoomId) {
    // Plan 3 replaces this with PreJoinCheck + InRoom screens.
    return (
      <div className="centered">
        <div className="form">
          <h3>Room {activeRoomId}</h3>
          <p style={{ color: "var(--text-dim)" }}>
            Media isn't wired up yet — this screen is a placeholder until Plan 3 ships the
            pre-join + in-room experience.
          </p>
          <button className="btn secondary" onClick={() => store.getState().clearActive()}>
            Back to lobby
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <strong>RedVoice</strong>
        <span style={{ color: "var(--text-dim)" }}>
          {user?.displayName} — <button className="btn secondary" style={{ padding: "4px 8px" }} onClick={() => void logout()}>Log out</button>
        </span>
      </div>

      <div className="lobby">
        <aside>
          <div className="section-title">My rooms</div>
          {owned.length === 0 ? (
            <div style={{ color: "var(--text-dim)" }}>None yet.</div>
          ) : (
            <ul className="room-list">
              {owned.map((r) => (
                <li key={r.id}>
                  <button onClick={() => void store.getState().join(r.id)}>{r.name}</button>
                </li>
              ))}
            </ul>
          )}

          <div className="section-title">Recent</div>
          {recent.length === 0 ? (
            <div style={{ color: "var(--text-dim)" }}>No recent rooms.</div>
          ) : (
            <ul className="room-list">
              {recent.map((r) => (
                <li key={r.id}>
                  <button onClick={() => void store.getState().join(r.id)}>{r.name}</button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main>
          <form className="form" onSubmit={onCreate}>
            <div className="section-title">Create a room</div>
            <input
              placeholder="Room name"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
            />
            <button className="btn" type="submit" disabled={!newRoomName.trim()}>
              Create
            </button>
          </form>

          <form className="form" onSubmit={onJoin}>
            <div className="section-title">Join by link or id</div>
            <input
              placeholder="voice.R3dWolfie.com/join/... or room id"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
            />
            <button className="btn secondary" type="submit" disabled={!joinInput.trim()}>
              Open room
            </button>
          </form>

          {status === "loading" && <div style={{ color: "var(--text-dim)" }}>Loading…</div>}
          {error && <div className="error">{error}</div>}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/renderer/src/lib/rooms-store.ts apps/client/src/renderer/src/screens/LobbyScreen.tsx
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): LobbyScreen with create + join-by-link"
```

---

## Task 10: Wire auth-state routing into `App.tsx`

**Files:**
- Modify: `apps/client/src/renderer/src/App.tsx`

- [ ] **Step 1: Replace the entire contents of `App.tsx`**

Write to `apps/client/src/renderer/src/App.tsx`:

```tsx
import { AuthProvider, useAuthStore } from "./lib/auth-context.js";
import { LoginScreen } from "./screens/LoginScreen.js";
import { LobbyScreen } from "./screens/LobbyScreen.js";

function Router(): JSX.Element {
  const status = useAuthStore((s) => s.status);

  if (status === "loading") {
    return (
      <div className="centered">
        <div style={{ color: "var(--text-dim)" }}>Loading…</div>
      </div>
    );
  }
  if (status === "authenticated") {
    return <LobbyScreen />;
  }
  return <LoginScreen />;
}

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Full typecheck**

Run: `pnpm --filter @redvoice/client typecheck`
Expected: no errors.

- [ ] **Step 3: Full test run**

Run: `pnpm --filter @redvoice/client test`
Expected: all tests pass (~13).

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/renderer/src/App.tsx
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "feat(client): auth-state-driven routing in App.tsx"
```

---

## Task 11: Manual smoke test + root README update

**Files:**
- Modify: `README.md` (root)

**Context:** End-to-end manual check — the acid test for Plan 2. Confirms the Electron app can talk to the locally-running app-server, persist a session across restarts, and go through the full register → list rooms → create room → logout flow.

- [ ] **Step 1: Start the app-server in one terminal**

From `/var/home/red/Projects/RedVoice/`:
```bash
pnpm server:dev
```
Leave this running. Expected: Fastify logs it's listening on `0.0.0.0:3000`.

- [ ] **Step 2: In another terminal, start the Electron client in dev mode**

```bash
pnpm --filter @redvoice/client dev
```
Expected: Electron window opens at 1200×800, showing the Login screen with a Server URL field prefilled with `http://localhost:3000`.

- [ ] **Step 3: Register a user**

In the app:
1. Click "Register" tab
2. Email: `smoketest@example.com`
3. Display name: `smoketester`
4. Password: `smoketest-password-123`
5. Click "Create account"

Expected: screen transitions to the Lobby. Top bar shows `smoketester`. Both "My rooms" and "Recent" are empty.

- [ ] **Step 4: Create a room**

Type `Smoke Test Room` into "Create a room" → click Create.
Expected: room appears under "My rooms" in the left sidebar. Can be clicked to open a placeholder Room screen ("Media isn't wired up yet…"). Click "Back to lobby" to return.

- [ ] **Step 5: Logout + persistence check**

Click "Log out" in the top bar. Expected: back to Login screen.

Close the Electron window entirely (Cmd/Ctrl+Q). Relaunch with `pnpm --filter @redvoice/client dev`.

Expected: app opens on the **Login screen** (not the lobby) because logout cleared the token.

- [ ] **Step 6: Session-persistence check**

Log in with `smoketest@example.com` / `smoketest-password-123`.

Close the window and relaunch `pnpm --filter @redvoice/client dev`.

Expected: app opens directly on the **Lobby screen** — the session was loaded from the encrypted file in `app.getPath("userData")`.

- [ ] **Step 7: Bad-link check**

Paste a garbage room id or malformed URL into "Join by link or id" → Open room.
Expected: error message appears in the main panel ("Room not found." or "That doesn't look like a room link or id.").

- [ ] **Step 8: Update the root README**

Replace the contents of `/var/home/red/Projects/RedVoice/README.md` with:

```markdown
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
```

- [ ] **Step 9: Commit**

```bash
git add README.md
git -c user.email=arui939@gmail.com -c user.name=R3dWolfie commit -m "docs: README covers client foundation (Plan 2)"
```

---

## Done — Plan 2 acceptance checklist

Before declaring Plan 2 complete, verify each of these manually:

- [ ] `pnpm -r typecheck` green
- [ ] `pnpm -r test` green — server tests (44) + client tests (~13) all pass
- [ ] Electron dev-run works: `pnpm --filter @redvoice/client dev` opens a window with the Login screen
- [ ] Register flow works end-to-end (new user → lands in Lobby)
- [ ] Login flow works (known user → lands in Lobby)
- [ ] Create-room works (POSTs to server, room appears in sidebar)
- [ ] Logout works (token cleared, back to Login, subsequent `/me` would 401)
- [ ] Session persists across app restart (encrypted token in `app.getPath("userData")/session.enc`)
- [ ] Bad room id/link produces a friendly error, doesn't crash

Once all boxes are checked, move on to Plan 3 (LiveKit infrastructure + Pre-Join + In-Room).
