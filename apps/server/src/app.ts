import Fastify, { type FastifyInstance } from "fastify";
import { registerErrorHandler } from "./errors.js";
import { authRoutes } from "./auth/routes.js";

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    disableRequestLogging: true,
  });

  registerErrorHandler(app);

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(authRoutes);

  return app;
}
