import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "./helpers/app";
import { resetDb, registerUser, authHeader, setHandle } from "./helpers/fixtures";

function dmThreadId(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

describe("mute level vs unread", () => {
  beforeEach(() => resetDb());

  it("level=none → unread is always 0", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    const threadId = dmThreadId(a.id, b.id);
    await app.inject({
      method: "PATCH", url: `/chat/threads/dm/${threadId}/mute`, headers: authHeader(a.token),
      payload: { level: "none" },
    });
    await app.inject({
      method: "POST", url: "/chat/messages", headers: authHeader(b.token),
      payload: { threadType: "dm", threadId, body: "hi @alpha" },
    });
    const res = await app.inject({ method: "GET", url: "/chat/unread", headers: authHeader(a.token) });
    expect(res.json().totalUnread).toBe(0);
  });

  it("level=mentions counts only mention-of-self messages", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    const threadId = dmThreadId(a.id, b.id);
    await app.inject({
      method: "PATCH", url: `/chat/threads/dm/${threadId}/mute`, headers: authHeader(a.token),
      payload: { level: "mentions" },
    });
    await app.inject({
      method: "POST", url: "/chat/messages", headers: authHeader(b.token),
      payload: { threadType: "dm", threadId, body: "no mention" },
    });
    await app.inject({
      method: "POST", url: "/chat/messages", headers: authHeader(b.token),
      payload: { threadType: "dm", threadId, body: "hey @alpha" },
    });
    const res = await app.inject({ method: "GET", url: "/chat/unread", headers: authHeader(a.token) });
    expect(res.json().totalUnread).toBe(1);
  });

  it("PATCH level=all with no mutedUntil clears the row (returns to default)", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    const r1 = await app.inject({
      method: "PATCH", url: "/chat/threads/dm/foo:bar/mute", headers: authHeader(a.token),
      payload: { level: "none" },
    });
    expect(r1.statusCode).toBe(204);
    const r2 = await app.inject({
      method: "PATCH", url: "/chat/threads/dm/foo:bar/mute", headers: authHeader(a.token),
      payload: { level: "all" },
    });
    expect(r2.statusCode).toBe(204);
  });
});
