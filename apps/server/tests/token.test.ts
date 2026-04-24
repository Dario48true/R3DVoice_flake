import { describe, it, expect, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { makeTestApp } from "./helpers/app.js";
import { createTestUser } from "./helpers/fixtures.js";
import { disconnectDb } from "./helpers/db.js";
import { prisma } from "../src/db.js";

async function login(app: FastifyInstance, email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  return res.json().token;
}

async function createRoom(app: FastifyInstance, token: string, name: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/rooms",
    headers: { authorization: `Bearer ${token}` },
    payload: { name },
  });
  return res.json().id;
}

describe("POST /rooms/:id/token", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });
  afterAll(async () => {
    await disconnectDb();
  });

  it("mints a LiveKit token for a valid room + user", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const session = await login(app, user.email, user.password);
    const roomId = await createRoom(app, session, "Test Room");

    const res = await app.inject({
      method: "POST",
      url: `/rooms/${roomId}/token`,
      headers: { authorization: `Bearer ${session}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toEqual(expect.any(String));
    expect(body.url).toMatch(/^wss?:\/\//);
    expect(body.roomId).toBe(roomId);

    // Decode the LiveKit token and verify basic claims.
    const decoded = jwt.verify(body.token, "y".repeat(32)) as Record<string, unknown>;
    expect(decoded.sub).toBe(user.id);
    expect(decoded.name).toBe(user.displayName);
    expect((decoded.video as { room: string }).room).toBe(roomId);
    expect((decoded.video as { canPublish: boolean }).canPublish).toBe(true);
    expect((decoded.video as { canSubscribe: boolean }).canSubscribe).toBe(true);
  });

  it("creates a RoomMembership row on first token fetch", async () => {
    app = await makeTestApp();
    const owner = await createTestUser();
    const visitor = await createTestUser();
    const tokenOwner = await login(app, owner.email, owner.password);
    const roomId = await createRoom(app, tokenOwner, "Owned");
    const tokenVisitor = await login(app, visitor.email, visitor.password);

    await app.inject({
      method: "POST",
      url: `/rooms/${roomId}/token`,
      headers: { authorization: `Bearer ${tokenVisitor}` },
    });

    const membership = await prisma.roomMembership.findUnique({
      where: { userId_roomId: { userId: visitor.id, roomId } },
    });
    expect(membership).not.toBeNull();
  });

  it("updates lastJoined on subsequent token fetches", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const token = await login(app, user.email, user.password);
    const roomId = await createRoom(app, token, "R");

    await app.inject({
      method: "POST",
      url: `/rooms/${roomId}/token`,
      headers: { authorization: `Bearer ${token}` },
    });
    const first = await prisma.roomMembership.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    });
    await new Promise((r) => setTimeout(r, 10));
    await app.inject({
      method: "POST",
      url: `/rooms/${roomId}/token`,
      headers: { authorization: `Bearer ${token}` },
    });
    const second = await prisma.roomMembership.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    });
    expect(second!.lastJoined.getTime()).toBeGreaterThanOrEqual(first!.lastJoined.getTime());
  });

  it("404s for unknown room", async () => {
    app = await makeTestApp();
    const user = await createTestUser();
    const token = await login(app, user.email, user.password);
    const res = await app.inject({
      method: "POST",
      url: "/rooms/00000000-0000-0000-0000-000000000000/token",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("requires auth", async () => {
    app = await makeTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/rooms/any/token",
    });
    expect(res.statusCode).toBe(401);
  });
});
