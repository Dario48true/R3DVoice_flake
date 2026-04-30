import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "./helpers/app";
import { resetDb, registerUser, authHeader, setHandle, createRoom } from "./helpers/fixtures";

describe("@handle parsing on POST /chat/messages", () => {
  beforeEach(() => resetDb());

  it("stores mentions[] when @handle matches a room participant", async () => {
    const app = await buildApp();
    const owner = await registerUser(app, { email: "owner@x.com" });
    const member = await registerUser(app, { email: "m@x.com" });
    await setHandle(app, owner.token, "owner");
    await setHandle(app, member.token, "bob");
    const room = await createRoom(app, owner.token, "studio");
    await app.inject({
      method: "POST", url: `/rooms/${room.id}/members`, headers: authHeader(owner.token),
      payload: { userId: member.id },
    });
    const send = await app.inject({
      method: "POST", url: "/chat/messages", headers: authHeader(owner.token),
      payload: { threadType: "room", threadId: room.id, body: "hey @bob can you check this" },
    });
    expect(send.statusCode).toBe(201);
    expect(send.json().message.mentions).toEqual([member.id]);
  });

  it("ignores @handles for non-participants", async () => {
    const app = await buildApp();
    const owner = await registerUser(app, { email: "owner@x.com" });
    const stranger = await registerUser(app, { email: "s@x.com" });
    await setHandle(app, owner.token, "owner");
    await setHandle(app, stranger.token, "stranger");
    const room = await createRoom(app, owner.token, "studio");
    const send = await app.inject({
      method: "POST", url: "/chat/messages", headers: authHeader(owner.token),
      payload: { threadType: "room", threadId: room.id, body: "what's up @stranger" },
    });
    expect(send.statusCode).toBe(201);
    const m = send.json().message;
    expect(m.mentions ?? []).toEqual([]);
  });

  it("does not parse @ inside email addresses", async () => {
    const app = await buildApp();
    const owner = await registerUser(app, { email: "owner@x.com" });
    await setHandle(app, owner.token, "owner");
    const room = await createRoom(app, owner.token, "studio");
    const send = await app.inject({
      method: "POST", url: "/chat/messages", headers: authHeader(owner.token),
      payload: { threadType: "room", threadId: room.id, body: "ping me at owner@x.com" },
    });
    const m = send.json().message;
    expect(m.mentions ?? []).toEqual([]);
  });

  it("matches case-insensitively", async () => {
    const app = await buildApp();
    const owner = await registerUser(app, { email: "owner@x.com" });
    const member = await registerUser(app, { email: "m@x.com" });
    await setHandle(app, owner.token, "owner");
    await setHandle(app, member.token, "RedWolf");
    const room = await createRoom(app, owner.token, "studio");
    await app.inject({
      method: "POST", url: `/rooms/${room.id}/members`, headers: authHeader(owner.token),
      payload: { userId: member.id },
    });
    const send = await app.inject({
      method: "POST", url: "/chat/messages", headers: authHeader(owner.token),
      payload: { threadType: "room", threadId: room.id, body: "ping @redwolf" },
    });
    expect(send.json().message.mentions).toEqual([member.id]);
  });

  it("dm threads parse mentions against the two participants", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    const threadId = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    const send = await app.inject({
      method: "POST", url: "/chat/messages", headers: authHeader(a.token),
      payload: { threadType: "dm", threadId, body: "hey @bravo" },
    });
    expect(send.json().message.mentions).toEqual([b.id]);
  });
});
