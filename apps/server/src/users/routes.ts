import type { FastifyInstance } from "fastify";
import { userHandleSchema } from "@redvoice/shared";
import { z } from "zod";
import { prisma } from "../db.js";
import { Prisma } from "@prisma/client";
import { requireAuth } from "../auth/middleware.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";

const setHandleSchema = z.object({ handle: userHandleSchema });
const handleParamSchema = z.object({ handle: z.string() });

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.post("/me/handle", { preHandler: requireAuth }, async (request) => {
    const parsed = setHandleSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "invalid handle");
    const userId = request.auth!.userId;

    const me = await prisma.user.findUnique({ where: { id: userId }, select: { handle: true } });
    if (me?.handle != null) throw new ConflictError("handle already set", "HANDLE_ALREADY_SET");

    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { handle: parsed.data.handle },
        select: { id: true, handle: true, displayName: true, email: true },
      });
      return updated;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("handle taken", "HANDLE_TAKEN");
      }
      throw err;
    }
  });

  app.get<{ Params: { handle: string } }>(
    "/users/by-handle/:handle",
    { preHandler: requireAuth },
    async (request) => {
      const parsed = handleParamSchema.safeParse(request.params);
      if (!parsed.success) throw new ValidationError("invalid handle");
      const lower = parsed.data.handle.toLowerCase();
      const user = await prisma.user.findFirst({
        where: { handle: lower },
        select: { id: true, handle: true, displayName: true },
      });
      if (!user) throw new NotFoundError("user not found");
      return user;
    },
  );
}
