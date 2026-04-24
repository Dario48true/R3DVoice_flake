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
