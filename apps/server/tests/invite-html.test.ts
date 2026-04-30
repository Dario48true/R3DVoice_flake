import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "./helpers/app";
import { resetDb, registerUser, authHeader, setHandle } from "./helpers/fixtures";

describe("invite HTML preview", () => {
  beforeEach(() => resetDb());

  it("returns HTML with creator handle and two auth links", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com" });
    await setHandle(app, a.token, "alpha");
    const inv = (await app.inject({
      method: "POST", url: "/invites", headers: authHeader(a.token), payload: { kind: "friend" },
    })).json();
    const res = await app.inject({ method: "GET", url: `/invite/${inv.code}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.body).toContain("@alpha");
    expect(res.body).toContain("Sign in");
    expect(res.body).toContain("Create account");
    expect(res.body).not.toContain("undefined");
  });

  it("escapes hostile display names", async () => {
    const app = await buildApp();
    const a = await registerUser(app, { email: "a@x.com", displayName: "<script>alert(1)</script>" });
    await setHandle(app, a.token, "alpha");
    const inv = (await app.inject({
      method: "POST", url: "/invites", headers: authHeader(a.token), payload: { kind: "friend" },
    })).json();
    const res = await app.inject({ method: "GET", url: `/invite/${inv.code}` });
    expect(res.body).not.toContain("<script>");
    expect(res.body).toContain("&lt;script&gt;");
  });

  it("renders friendly state for unknown code", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/invite/AAAAAAAA" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.body).toMatch(/expired|not.found|unknown/i);
  });
});
