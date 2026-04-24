import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb, disconnectDb } from "./helpers/db.js";

describe("Prisma + SQLite smoke test", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it("creates and retrieves a user", async () => {
    const user = await prisma.user.create({
      data: { email: "a@b.com", displayName: "alice", passwordHash: "fake" },
    });
    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found?.email).toBe("a@b.com");
  });
});
