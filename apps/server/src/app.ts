import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { registerErrorHandler } from "./errors.js";
import { authRoutes } from "./auth/routes.js";
import { roomRoutes } from "./rooms/routes.js";
import { chatRoutes } from "./chat/routes.js";
import { chatWsRoutes } from "./chat/ws.js";
import { friendsRoutes } from "./friends/routes.js";
import { landingRoutes } from "./landing.js";
import { userRoutes } from "./users/routes.js";
import { inviteRoutes } from "./invites/routes.js";

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    disableRequestLogging: true,
    trustProxy: true,
  });

  // The Electron renderer runs on http://localhost:5173 in dev (Vite) and
  // from a `file://` origin in production builds. Reflecting any origin is
  // acceptable for a self-hosted app where authorization is enforced by JWTs.
  await app.register(cors, { origin: true, credentials: true });

  await app.register(rateLimit, { global: false });

  registerErrorHandler(app);

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(landingRoutes);
  await app.register(authRoutes);
  await app.register(roomRoutes);
  await app.register(chatWsRoutes);
  await app.register(chatRoutes);
  await app.register(friendsRoutes);
  await app.register(userRoutes);
  await app.register(inviteRoutes);

  return app;
}
