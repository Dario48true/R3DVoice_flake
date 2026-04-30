import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "./helpers/app";
import { resetDb, registerUser, authHeader, setHandle, createRoom } from "./helpers/fixtures";

describe("presence + friend currentRoom", () => {
  beforeEach(() => resetDb());

  it("POST /me/presence sets currentRoomId", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    const room = await createRoom(app, a.token, "studio");
    const res = await app.inject({
      method: "POST", url: "/me/presence", headers: authHeader(a.token),
      payload: { roomId: room.id },
    });
    expect(res.statusCode).toBe(204);
  });

  it("POST /me/presence with roomId=null clears it", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    const room = await createRoom(app, a.token, "studio");
    await app.inject({
      method: "POST", url: "/me/presence", headers: authHeader(a.token),
      payload: { roomId: room.id },
    });
    const res = await app.inject({
      method: "POST", url: "/me/presence", headers: authHeader(a.token),
      payload: { roomId: null },
    });
    expect(res.statusCode).toBe(204);
  });

  it("GET /friends includes currentRoom for friends in a room", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    // Create accepted friendship.
    await app.inject({
      method: "POST", url: "/friends/request", headers: authHeader(a.token),
      payload: { email: "b@x.com" },
    });
    const friendsList = (await app.inject({ method: "GET", url: "/friends", headers: authHeader(b.token) })).json();
    const fid = friendsList.friends[0].friendshipId;
    await app.inject({ method: "POST", url: `/friends/${fid}/accept`, headers: authHeader(b.token) });
    // b joins a room.
    const room = await createRoom(app, b.token, "Bob's Room");
    await app.inject({
      method: "POST", url: "/me/presence", headers: authHeader(b.token),
      payload: { roomId: room.id },
    });
    // a checks friends.
    const res = await app.inject({ method: "GET", url: "/friends", headers: authHeader(a.token) });
    const bobEntry = res.json().friends.find((f: { user: { email: string } }) => f.user.email === "b@x.com");
    expect(bobEntry.user.currentRoom).toMatchObject({ id: room.id, name: "Bob's Room" });
  });
});
