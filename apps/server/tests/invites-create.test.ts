import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "./helpers/app";
import { resetDb, registerUser, authHeader, setHandle, createRoom } from "./helpers/fixtures";

describe("invite create + list", () => {
  beforeEach(() => resetDb());

  it("creates a friend invite without targetRoomId", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    const res = await app.inject({
      method: "POST", url: "/invites", headers: authHeader(a.token),
      payload: { kind: "friend" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.kind).toBe("friend");
    expect(body.code).toMatch(/^[A-Za-z2-9]{8}$/);
    expect(body.targetRoomId).toBeNull();
    expect(body.uses).toBe(0);
  });

  it("creates a room invite with targetRoomId", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    const room = await createRoom(app, a.token, "studio");
    const res = await app.inject({
      method: "POST", url: "/invites", headers: authHeader(a.token),
      payload: { kind: "room", targetRoomId: room.id },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().targetRoomId).toBe(room.id);
  });

  it("rejects kind=room without targetRoomId", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    const res = await app.inject({
      method: "POST", url: "/invites", headers: authHeader(a.token),
      payload: { kind: "room" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects kind=friend with targetRoomId", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    const room = await createRoom(app, a.token, "studio");
    const res = await app.inject({
      method: "POST", url: "/invites", headers: authHeader(a.token),
      payload: { kind: "friend", targetRoomId: room.id },
    });
    expect(res.statusCode).toBe(400);
  });

  it("only room members can create room invites", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    const room = await createRoom(app, a.token, "studio");
    const res = await app.inject({
      method: "POST", url: "/invites", headers: authHeader(b.token),
      payload: { kind: "room", targetRoomId: room.id },
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /invites lists my invites", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    await app.inject({ method: "POST", url: "/invites", headers: authHeader(a.token), payload: { kind: "friend" } });
    await app.inject({ method: "POST", url: "/invites", headers: authHeader(a.token), payload: { kind: "friend" } });
    const res = await app.inject({ method: "GET", url: "/invites", headers: authHeader(a.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().invites).toHaveLength(2);
  });
});
