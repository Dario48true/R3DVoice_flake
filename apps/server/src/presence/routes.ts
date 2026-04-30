import type { FastifyInstance } from "fastify";
import { setPresenceSchema } from "@redvoice/shared";
import { prisma } from "../db.js";
import { requireAuth } from "../auth/middleware.js";
import { ValidationError } from "../errors.js";

export async function presenceRoutes(app: FastifyInstance): Promise<void> {
  app.post("/me/presence", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = setPresenceSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError("invalid input");
    const userId = request.auth!.userId;
    await prisma.user.update({
      where: { id: userId },
      data: { currentRoomId: parsed.data.roomId },
    });
    reply.status(204).send();
  });
}
