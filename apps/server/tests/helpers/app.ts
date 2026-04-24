import { buildApp } from "../../src/app.js";
import { resetDb } from "./db.js";
import type { FastifyInstance } from "fastify";

export async function makeTestApp(): Promise<FastifyInstance> {
  await resetDb();
  return buildApp({ logger: false });
}
