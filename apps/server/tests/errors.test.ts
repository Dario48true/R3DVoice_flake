import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeTestApp } from "./helpers/app.js";
import { AuthError, ConflictError, NotFoundError, ValidationError } from "../src/errors.js";

describe("error handler", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });

  it("maps ValidationError to 400 with structured body", async () => {
    app = await makeTestApp();
    app.get("/boom", async () => {
      throw new ValidationError("bad input");
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "bad input" },
    });
  });

  it("maps AuthError to 401", async () => {
    app = await makeTestApp();
    app.get("/boom", async () => {
      throw new AuthError("nope");
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("AUTH_ERROR");
  });

  it("maps NotFoundError to 404", async () => {
    app = await makeTestApp();
    app.get("/boom", async () => {
      throw new NotFoundError("gone");
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("maps ConflictError to 409", async () => {
    app = await makeTestApp();
    app.get("/boom", async () => {
      throw new ConflictError("dup");
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("unknown errors → 500 without leaking stack", async () => {
    app = await makeTestApp();
    app.get("/boom", async () => {
      throw new Error("internal detail we don't want leaked");
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).not.toContain("internal detail");
  });
});
