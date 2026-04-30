import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "./helpers/app";
import { resetDb, registerUser, authHeader, setHandle, createRoom } from "./helpers/fixtures";
import { prisma } from "../src/db";

async function createFriendInvite(app: any, token: string, opts: Partial<{ expiresAt: string | null; maxUses: number | null }> = {}) {
  return (await app.inject({
    method: "POST", url: "/invites", headers: authHeader(token),
    payload: { kind: "friend", ...opts },
  })).json();
}

describe("invite redeem", () => {
  beforeEach(() => resetDb());

  it("friend redemption creates accepted friendship + increments uses", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    const inv = await createFriendInvite(app, a.token);
    const res = await app.inject({
      method: "POST", url: `/invites/${inv.code}/redeem`, headers: authHeader(b.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ kind: "friend", redirectTo: "/dms" });
    const fs = await prisma.friendship.findFirst({ where: { OR: [{ requesterId: a.id, recipientId: b.id }, { requesterId: b.id, recipientId: a.id }] } });
    expect(fs?.status).toBe("accepted");
    const after = (await app.inject({ method: "GET", url: "/invites", headers: authHeader(a.token) })).json();
    expect(after.invites[0].uses).toBe(1);
  });

  it("room redemption upserts membership", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    const room = await createRoom(app, a.token, "studio");
    const inv = (await app.inject({
      method: "POST", url: "/invites", headers: authHeader(a.token),
      payload: { kind: "room", targetRoomId: room.id },
    })).json();
    const res = await app.inject({ method: "POST", url: `/invites/${inv.code}/redeem`, headers: authHeader(b.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ kind: "room", redirectTo: `/rooms/${room.id}` });
  });

  it("rejects expired", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    const inv = await createFriendInvite(app, a.token, { expiresAt: new Date(Date.now() - 1000).toISOString() });
    const res = await app.inject({ method: "POST", url: `/invites/${inv.code}/redeem`, headers: authHeader(b.token) });
    expect(res.statusCode).toBe(410);
  });

  it("rejects revoked", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    const inv = await createFriendInvite(app, a.token);
    await app.inject({ method: "DELETE", url: `/invites/${inv.id}`, headers: authHeader(a.token) });
    const res = await app.inject({ method: "POST", url: `/invites/${inv.code}/redeem`, headers: authHeader(b.token) });
    expect(res.statusCode).toBe(410);
  });

  it("rejects when uses == maxUses", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    const c = await registerUser(app, { email: "c@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    await setHandle(app, c.token, "charlie");
    const inv = await createFriendInvite(app, a.token, { maxUses: 1 });
    await app.inject({ method: "POST", url: `/invites/${inv.code}/redeem`, headers: authHeader(b.token) });
    const res = await app.inject({ method: "POST", url: `/invites/${inv.code}/redeem`, headers: authHeader(c.token) });
    expect(res.statusCode).toBe(409);
  });

  it("rejects self-redeem", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    const inv = await createFriendInvite(app, a.token);
    const res = await app.inject({ method: "POST", url: `/invites/${inv.code}/redeem`, headers: authHeader(a.token) });
    expect(res.statusCode).toBe(400);
  });

  it("idempotent on already-friends", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    const inv = await createFriendInvite(app, a.token);
    await app.inject({ method: "POST", url: `/invites/${inv.code}/redeem`, headers: authHeader(b.token) });
    const res = await app.inject({ method: "POST", url: `/invites/${inv.code}/redeem`, headers: authHeader(b.token) });
    expect(res.statusCode).toBe(200);
    const after = (await app.inject({ method: "GET", url: "/invites", headers: authHeader(a.token) })).json();
    expect(after.invites[0].uses).toBe(1);
  });
});
