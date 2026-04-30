import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 10_000,
    pool: "forks",            // Prisma doesn't like threads
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,   // tests share the test.db; serialise them
    globalSetup: ["./tests/global-setup.ts"],
    env: {
      // Tests run against a SEPARATE prisma/test.db file, never the dev DB.
      // global-setup.ts builds a fresh schema on test.db before any test runs;
      // the dev server is free to use dev.db with real data, undisturbed.
      DATABASE_URL: "file:./test.db",
      JWT_SECRET: "x".repeat(32),
      LIVEKIT_URL: "ws://localhost:7880",
      LIVEKIT_API_KEY: "testkey",
      LIVEKIT_API_SECRET: "y".repeat(32),
      NODE_ENV: "test",
    },
  },
});
