import type { FastifyInstance } from "fastify";
import { userHandleSchema } from "@redvoice/shared";
import { z } from "zod";
import { prisma } from "../db.js";
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

    const handle = parsed.data.handle;

    // Check for collision manually (no unique index on handle in the schema).
    const existing = await prisma.user.findFirst({ where: { handle } });
    if (existing) throw new ConflictError("handle taken", "HANDLE_TAKEN");

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { handle },
      select: { id: true, handle: true, displayName: true, email: true },
    });
    return updated;
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
