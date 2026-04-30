import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "./helpers/app";
import { resetDb, registerUser, authHeader, setHandle, createRoom } from "./helpers/fixtures";

describe("invite revoke", () => {
  beforeEach(() => resetDb());

  it("creator can revoke their own invite", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    const created = await app.inject({ method: "POST", url: "/invites", headers: authHeader(a.token), payload: { kind: "friend" } });
    const inv = created.json();
    const res = await app.inject({ method: "DELETE", url: `/invites/${inv.id}`, headers: authHeader(a.token) });
    expect(res.statusCode).toBe(204);
    const list = (await app.inject({ method: "GET", url: "/invites", headers: authHeader(a.token) })).json();
    expect(list.invites[0].revokedAt).toBeTruthy();
  });

  it("non-creator non-owner cannot revoke", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    const created = await app.inject({ method: "POST", url: "/invites", headers: authHeader(a.token), payload: { kind: "friend" } });
    const inv = created.json();
    const res = await app.inject({ method: "DELETE", url: `/invites/${inv.id}`, headers: authHeader(b.token) });
    expect(res.statusCode).toBe(403);
  });

  it("room owner can revoke any room invite for their room", async () => {
    const app = await buildApp();
    const owner = await registerUser(app, { email: "owner@x.com" });
    const member = await registerUser(app, { email: "member@x.com" });
    await setHandle(app, owner.token, "owner");
    await setHandle(app, member.token, "member");
    const room = await createRoom(app, owner.token, "studio");
    // owner adds member
    const memberLookup = await app.inject({ method: "GET", url: "/users/by-handle/member", headers: authHeader(owner.token) });
    await app.inject({
      method: "POST", url: `/rooms/${room.id}/members`, headers: authHeader(owner.token),
      payload: { userId: memberLookup.json().id },
    });
    // member creates an invite
    const created = await app.inject({
      method: "POST", url: "/invites", headers: authHeader(member.token),
      payload: { kind: "room", targetRoomId: room.id },
    });
    const inv = created.json();
    // owner revokes it
    const res = await app.inject({ method: "DELETE", url: `/invites/${inv.id}`, headers: authHeader(owner.token) });
    expect(res.statusCode).toBe(204);
  });
});
