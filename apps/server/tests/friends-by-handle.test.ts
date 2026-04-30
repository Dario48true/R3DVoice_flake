import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "./helpers/app";
import { resetDb, registerUser, authHeader, setHandle } from "./helpers/fixtures";

describe("friends by handle", () => {
  beforeEach(() => resetDb());

  it("creates a pending request when handle exists", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    const res = await app.inject({
      method: "POST",
      url: "/friends/request-by-handle",
      headers: authHeader(a.token),
      payload: { handle: "bravo" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: "pending-outgoing", user: { handle: "bravo" } });
  });

  it("404s when handle is unknown", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    const res = await app.inject({
      method: "POST", url: "/friends/request-by-handle", headers: authHeader(a.token),
      payload: { handle: "ghost" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects friending yourself", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    const res = await app.inject({
      method: "POST", url: "/friends/request-by-handle", headers: authHeader(a.token),
      payload: { handle: "alpha" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("conflicts on duplicate request", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    const b = await registerUser(app, { email: "b@x.com" });
    await setHandle(app, a.token, "alpha");
    await setHandle(app, b.token, "bravo");
    await app.inject({ method: "POST", url: "/friends/request-by-handle", headers: authHeader(a.token), payload: { handle: "bravo" } });
    const res = await app.inject({ method: "POST", url: "/friends/request-by-handle", headers: authHeader(a.token), payload: { handle: "bravo" } });
    expect(res.statusCode).toBe(409);
  });
});
