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
