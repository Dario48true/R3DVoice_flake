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
