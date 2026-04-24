import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __redvoice_prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__redvoice_prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "test" ? [] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__redvoice_prisma = prisma;
}
