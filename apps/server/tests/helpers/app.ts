import { buildApp as buildAppSrc } from "../../src/app.js";
import { resetDb } from "./db.js";
import type { FastifyInstance } from "fastify";

export async function makeTestApp(): Promise<FastifyInstance> {
  await resetDb();
  return buildAppSrc({ logger: false });
}

/** Alias used by newer tests that call buildApp() directly without resetDb. */
export async function buildApp(): Promise<FastifyInstance> {
  return buildAppSrc({ logger: false });
}
