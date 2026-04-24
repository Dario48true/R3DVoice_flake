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
