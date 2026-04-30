import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { generateUniqueHandle } from "../src/auth/handle-generator.js";
import { prisma } from "../src/db.js";
import { disconnectDb } from "./helpers/db.js";

describe("generateUniqueHandle", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({});
  });
  afterAll(async () => {
    await disconnectDb();
  });

  it("slugifies a simple display name", async () => {
    expect(await generateUniqueHandle("Alice")).toBe("alice");
  });

  it("preserves digits and underscores", async () => {
    expect(await generateUniqueHandle("R3dWolfie_42")).toBe("r3dwolfie_42");
  });

  it("replaces whitespace with underscore", async () => {
    expect(await generateUniqueHandle("Cool Person")).toBe("cool_person");
  });

  it("strips emoji and non-alphanumeric", async () => {
    expect(await generateUniqueHandle("🐺R3d!")).toBe("r3d");
  });

  it("falls back to 'user' when input is empty after cleaning", async () => {
    expect(await generateUniqueHandle("🐺")).toBe("user");
  });

  it("truncates to 20 characters", async () => {
    const result = await generateUniqueHandle("a".repeat(50));
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).toBe("a".repeat(20));
  });

  it("appends _2 on collision", async () => {
    await prisma.user.create({
      data: {
        email: "x@y.z",
        passwordHash: "x",
        displayName: "John",
        handle: "john",
        handleLower: "john",
      },
    });
    expect(await generateUniqueHandle("John")).toBe("john_2");
  });

  it("appends _3 when _2 also taken", async () => {
    for (const lower of ["john", "john_2"]) {
      await prisma.user.create({
        data: {
          email: `${lower}@y.z`,
          passwordHash: "x",
          displayName: lower,
          handle: lower,
          handleLower: lower,
        },
      });
    }
    expect(await generateUniqueHandle("John")).toBe("john_3");
  });

  it("uses 'user' fallback with collision suffix when needed", async () => {
    await prisma.user.create({
      data: { email: "u@y.z", passwordHash: "x", displayName: "u", handle: "user", handleLower: "user" },
    });
    expect(await generateUniqueHandle("🐺")).toBe("user_2");
  });
});
