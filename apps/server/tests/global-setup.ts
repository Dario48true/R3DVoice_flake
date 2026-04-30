import { execSync } from "node:child_process";
import { unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Vitest global setup. Runs once per test run, before any test file.
//
// Builds a fresh test.db sibling to dev.db so the test suite NEVER touches
// the developer's real data. We delete the existing file (if any), then run
// `prisma migrate deploy` against it so the schema is current.
export default async function setup(): Promise<void> {
  const testDbPath = resolve(import.meta.dirname, "../prisma/test.db");
  if (existsSync(testDbPath)) {
    unlinkSync(testDbPath);
  }
  // -journal cleanup in case a previous run was killed mid-write
  const journalPath = `${testDbPath}-journal`;
  if (existsSync(journalPath)) {
    unlinkSync(journalPath);
  }

  // Apply migrations against the test DB. We run prisma's CLI directly with
  // an overridden DATABASE_URL — this matches what tests will see at runtime.
  execSync("pnpm prisma migrate deploy", {
    cwd: resolve(import.meta.dirname, ".."),
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "inherit",
  });
}
