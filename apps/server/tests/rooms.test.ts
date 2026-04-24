import { describe, it, expect, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeTestApp } from "./helpers/app.js";
import { createTestUser } from "./helpers/fixtures.js";
import { disconnectDb } from "./helpers/db.js";

async function login(app: FastifyInstance, email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  return res.json().token;
}

describe("rooms", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });
  afterAll(async () => {
    await disconnectDb();
  });

  it("POST /rooms creates a room owned by the authenticated user", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const token = await login(app, user.email, user.password);
    const res = await app.inject({
      method: "POST",
      url: "/rooms",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Friday Gaming" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toEqual(expect.any(String));
    expect(body.name).toBe("Friday Gaming");
    expect(body.ownerId).toBe(user.id);
    expect(body.isOwner).toBe(true);
  });

  it("POST /rooms rejects empty name", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const token = await login(app, user.email, user.password);
    const res = await app.inject({
      method: "POST",
      url: "/rooms",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /rooms requires auth", async () => {
    app = await makeTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/rooms",
      payload: { name: "Public" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /rooms returns owned and recent rooms split", async () => {
    app = await makeTestApp();
    const alice = await createTestUser();
    const tokenA = await login(app, alice.email, alice.password);
    await app.inject({
      method: "POST",
      url: "/rooms",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: "Alice's Room" },
    });
    const res = await app.inject({
      method: "GET",
      url: "/rooms",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.owned).toHaveLength(1);
    expect(body.owned[0].name).toBe("Alice's Room");
    expect(body.recent).toEqual([]);
  });

  it("GET /rooms/:id returns room metadata; isOwner=false for non-owner", async () => {
    app = await makeTestApp();
    const alice = await createTestUser();
    const bob = await createTestUser();
    const tokenA = await login(app, alice.email, alice.password);
    const create = await app.inject({
      method: "POST",
      url: "/rooms",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: "A" },
    });
    const roomId = create.json().id;
    const tokenB = await login(app, bob.email, bob.password);
    const res = await app.inject({
      method: "GET",
      url: `/rooms/${roomId}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(roomId);
    expect(body.isOwner).toBe(false);
    expect(body.lastJoined).toBeNull();
  });

  it("GET /rooms/:id 404s for unknown room", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const token = await login(app, user.email, user.password);
    const res = await app.inject({
      method: "GET",
      url: "/rooms/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
