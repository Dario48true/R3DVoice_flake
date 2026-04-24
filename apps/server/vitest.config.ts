import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 10_000,
    pool: "forks",            // Prisma doesn't like threads
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,   // tests share the dev.db; serialise them
    env: {
      // Prisma resolves `file:./...` relative to schema.prisma, so this is apps/server/prisma/dev.db
      DATABASE_URL: "file:./dev.db",
      JWT_SECRET: "x".repeat(32),
      LIVEKIT_URL: "ws://localhost:7880",
      LIVEKIT_API_KEY: "testkey",
      LIVEKIT_API_SECRET: "y".repeat(32),
      NODE_ENV: "test",
    },
  },
});
