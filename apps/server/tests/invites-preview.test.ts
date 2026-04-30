import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "./helpers/app";
import { resetDb, registerUser, authHeader, setHandle, createRoom } from "./helpers/fixtures";

describe("invite preview (public + authed)", () => {
  beforeEach(() => resetDb());

  it("public preview returns minimal metadata, no room name", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    const room = await createRoom(app, a.token, "Secret Studio");
    const inv = (await app.inject({
      method: "POST", url: "/invites", headers: authHeader(a.token),
      payload: { kind: "room", targetRoomId: room.id },
    })).json();

    const res = await app.inject({ method: "GET", url: `/invites/${inv.code}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.creator).toMatchObject({ handle: "alpha" });
    expect(body.kind).toBe("room");
    expect(body).not.toHaveProperty("targetRoomId");
    expect(body).not.toHaveProperty("targetRoom");
    expect(JSON.stringify(body)).not.toContain("Secret Studio");
  });

  it("authed /full preview reveals room name and member count", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    const room = await createRoom(app, a.token, "Secret Studio");
    const inv = (await app.inject({
      method: "POST", url: "/invites", headers: authHeader(a.token),
      payload: { kind: "room", targetRoomId: room.id },
    })).json();

    const res = await app.inject({ method: "GET", url: `/invites/${inv.code}/full`, headers: authHeader(b.token) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.targetRoom).toMatchObject({ id: room.id, name: "Secret Studio" });
    expect(body.targetRoom.memberCount).toBeGreaterThanOrEqual(0);
  });

  it("/full requires auth", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    const inv = (await app.inject({
      method: "POST", url: "/invites", headers: authHeader(a.token),
      payload: { kind: "friend" },
    })).json();
    const res = await app.inject({ method: "GET", url: `/invites/${inv.code}/full` });
    expect(res.statusCode).toBe(401);
  });

  it("public preview 404s on unknown code", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/invites/AAAAAAAA" });
    expect(res.statusCode).toBe(404);
  });
});
