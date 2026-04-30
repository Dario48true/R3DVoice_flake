import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "./helpers/app.js";
import { resetDb, registerUser, authHeader } from "./helpers/fixtures.js";

describe("handles", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("POST /me/handle sets handle when null", async () => {
    const app = await buildApp();
    const { token } = await registerUser(app, { email: "a@x.com" });
    const res = await app.inject({
      method: "POST",
      url: "/me/handle",
      headers: authHeader(token),
      payload: { handle: "alpha" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ handle: "alpha" });
  });

  it("POST /me/handle rejects double-set", async () => {
    const app = await buildApp();
    const { token } = await registerUser(app, { email: "a@x.com" });
    await app.inject({ method: "POST", url: "/me/handle", headers: authHeader(token), payload: { handle: "alpha" } });
    const res = await app.inject({ method: "POST", url: "/me/handle", headers: authHeader(token), payload: { handle: "beta" } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: "HANDLE_ALREADY_SET" } });
  });

  it("POST /me/handle rejects invalid format", async () => {
    const app = await buildApp();
    const { token } = await registerUser(app, { email: "a@x.com" });
    for (const bad of ["ab", "Has-Dashes", "WITH_CAPS", "x".repeat(25), ""]) {
      const res = await app.inject({
        method: "POST", url: "/me/handle", headers: authHeader(token), payload: { handle: bad },
      });
      expect(res.statusCode, `bad="${bad}"`).toBe(400);
    }
  });

  it("POST /me/handle rejects collisions", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await app.inject({ method: "POST", url: "/me/handle", headers: authHeader(a.token), payload: { handle: "shared" } });
    const res = await app.inject({ method: "POST", url: "/me/handle", headers: authHeader(b.token), payload: { handle: "shared" } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: "HANDLE_TAKEN" } });
  });

  it("GET /users/by-handle/:handle resolves case-insensitively", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await app.inject({ method: "POST", url: "/me/handle", headers: authHeader(a.token), payload: { handle: "alpha" } });
    const res = await app.inject({ method: "GET", url: "/users/by-handle/ALPHA", headers: authHeader(a.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ handle: "alpha" });
  });

  it("GET /users/by-handle/:handle 404s on unknown", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const res = await app.inject({ method: "GET", url: "/users/by-handle/ghost", headers: authHeader(a.token) });
    expect(res.statusCode).toBe(404);
  });
});
