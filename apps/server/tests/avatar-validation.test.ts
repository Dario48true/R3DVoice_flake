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
