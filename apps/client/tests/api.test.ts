import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ApiClient, ApiError } from "../src/renderer/src/lib/api.js";
import { extractInviteCode } from "../src/renderer/src/lib/rooms-store.js";

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

  it("createInvite POSTs /invites with the right body", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: "i1", code: "ABCDEFGH" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const api = new ApiClient(BASE);
    api.setToken("tok");
    await api.createInvite({ kind: "friend", expiresAt: null, maxUses: null });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/invites",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ kind: "friend", expiresAt: null, maxUses: null }),
      }),
    );
  });

  it("dmThreads decodes otherParticipant correctly", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({
        threads: [{
          threadId: "aaa:bbb",
          lastMessage: {
            id: "m1", threadType: "dm", threadId: "aaa:bbb",
            authorId: "aaa", authorName: "Alice", body: "hi",
            createdAt: "2026-04-30T00:00:00Z", editedAt: null, deletedAt: null,
          },
          otherParticipant: { id: "bbb", handle: "bob", displayName: "Bob" },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const api = new ApiClient(BASE);
    api.setToken("tok");
    const r = await api.dmThreads();
    expect(r.threads[0]!.otherParticipant).toMatchObject({ id: "bbb", handle: "bob" });
  });
});

describe("extractInviteCode", () => {
  it("recognizes a bare 8-char code", () => {
    expect(extractInviteCode("ABCDEFGH")).toBe("ABCDEFGH");
    expect(extractInviteCode("a2b3c4d5")).toBe("a2b3c4d5");
  });

  it("recognizes /invite/<code> URLs", () => {
    expect(extractInviteCode("https://voice.r3dwolfie.com/invite/ABCDEFGH")).toBe("ABCDEFGH");
    expect(extractInviteCode("http://localhost:3000/invite/MNPQRSTU")).toBe("MNPQRSTU");
  });

  it("rejects non-invite URLs", () => {
    expect(extractInviteCode("https://voice.r3dwolfie.com/join/abc-123")).toBeNull();
    expect(extractInviteCode("https://example.com")).toBeNull();
    expect(extractInviteCode("not-a-url")).toBeNull();
    expect(extractInviteCode("")).toBeNull();
  });

  it("rejects malformed codes", () => {
    expect(extractInviteCode("SHORT")).toBeNull();
    expect(extractInviteCode("TOOOLOONG")).toBeNull();
  });

  it("trims whitespace", () => {
    expect(extractInviteCode("  ABCDEFGH  ")).toBe("ABCDEFGH");
  });
});
