import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { getConfig } from "../config.js";
import { AuthError } from "../errors.js";
import { verifySessionToken, type SessionTokenPayload } from "./jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    auth?: {
      userId: string;
      sessionId: string;
    };
  }
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new AuthError("missing bearer token");
  }
  const token = header.slice("Bearer ".length).trim();
  let payload: SessionTokenPayload;
  try {
    payload = verifySessionToken(token, getConfig().JWT_SECRET);
  } catch {
    throw new AuthError("invalid token");
  }
  const session = await prisma.session.findUnique({ where: { id: payload.sessionId } });
  if (!session || session.revokedAt !== null) {
    throw new AuthError("session revoked");
  }
  request.auth = { userId: payload.userId, sessionId: payload.sessionId };
}
