import Fastify, { type FastifyInstance } from "fastify";

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    disableRequestLogging: true,
  });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
