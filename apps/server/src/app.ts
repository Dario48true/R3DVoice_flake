import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { registerErrorHandler } from "./errors.js";
import { authRoutes } from "./auth/routes.js";
import { roomRoutes } from "./rooms/routes.js";

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    disableRequestLogging: true,
    trustProxy: true,
  });

  await app.register(rateLimit, { global: false });

  registerErrorHandler(app);

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(authRoutes);
  await app.register(roomRoutes);

  return app;
}
