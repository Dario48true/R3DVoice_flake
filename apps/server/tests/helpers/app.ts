import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

export async function makeTestApp(): Promise<FastifyInstance> {
  return buildApp({ logger: false });
}
