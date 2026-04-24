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
