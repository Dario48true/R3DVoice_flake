import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "./helpers/app";
import { resetDb, registerUser, authHeader, setHandle } from "./helpers/fixtures";

describe("read + unread", () => {
  beforeEach(() => resetDb());

  it("POST /chat/read upserts a read marker", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    const ts = "2026-04-30T12:00:00.000Z";
    const res = await app.inject({
      method: "POST", url: "/chat/read", headers: authHeader(a.token),
      payload: { threadType: "dm", threadId: "dummy:thread", lastReadAt: ts },
    });
    expect(res.statusCode).toBe(204);
  });

  it("GET /chat/unread returns 0 for empty state", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    const res = await app.inject({ method: "GET", url: "/chat/unread", headers: authHeader(a.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ counts: {}, totalUnread: 0 });
  });

  it("GET /chat/unread counts DM messages newer than lastReadAt", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    const threadId = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: "POST", url: "/chat/messages", headers: authHeader(b.token),
        payload: { threadType: "dm", threadId, body: `msg ${i}` },
      });
    }
    const res = await app.inject({ method: "GET", url: "/chat/unread", headers: authHeader(a.token) });
    expect(res.json().totalUnread).toBe(3);
    expect(res.json().counts[`dm:${threadId}`]).toBe(3);
  });

  it("messages authored by the caller don't count as unread for them", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    const threadId = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    await app.inject({
      method: "POST", url: "/chat/messages", headers: authHeader(a.token),
      payload: { threadType: "dm", threadId, body: "hi from me" },
    });
    const res = await app.inject({ method: "GET", url: "/chat/unread", headers: authHeader(a.token) });
    expect(res.json().totalUnread).toBe(0);
  });

  it("read marker shrinks unread count", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    const threadId = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    await app.inject({
      method: "POST", url: "/chat/messages", headers: authHeader(b.token),
      payload: { threadType: "dm", threadId, body: "old" },
    });
    await app.inject({
      method: "POST", url: "/chat/read", headers: authHeader(a.token),
      payload: { threadType: "dm", threadId, lastReadAt: new Date().toISOString() },
    });
    const res = await app.inject({ method: "GET", url: "/chat/unread", headers: authHeader(a.token) });
    expect(res.json().totalUnread).toBe(0);
  });
});
