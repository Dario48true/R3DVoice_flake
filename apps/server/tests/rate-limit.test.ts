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
