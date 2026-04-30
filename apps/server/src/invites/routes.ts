import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createInviteSchema, type InviteDTO } from "@redvoice/shared";
import { prisma } from "../db.js";
import { requireAuth } from "../auth/middleware.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { generateInviteCode } from "./code.js";

const idParamSchema = z.object({ id: z.string().uuid() });

function toDTO(inv: {
  id: string; code: string; kind: string; creatorId: string;
  targetRoomId: string | null; expiresAt: Date | null; maxUses: number | null;
  uses: number; revokedAt: Date | null; createdAt: Date;
}): InviteDTO {
  return {
    id: inv.id,
    code: inv.code,
    kind: inv.kind as "room" | "friend",
    creatorId: inv.creatorId,
    targetRoomId: inv.targetRoomId,
    expiresAt: inv.expiresAt?.toISOString() ?? null,
    maxUses: inv.maxUses,
    uses: inv.uses,
    revokedAt: inv.revokedAt?.toISOString() ?? null,
    createdAt: inv.createdAt.toISOString(),
  };
}

export async function inviteRoutes(app: FastifyInstance): Promise<void> {
  // Create
  app.post("/invites", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createInviteSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "invalid input");
    const userId = request.auth!.userId;

    if (parsed.data.kind === "room") {
      const room = await prisma.room.findUnique({ where: { id: parsed.data.targetRoomId! } });
      if (!room) throw new NotFoundError("room not found");
      const isAllowed = room.ownerId === userId || (await prisma.roomMembership.findUnique({
        where: { userId_roomId: { userId, roomId: room.id } },
      })) !== null;
      if (!isAllowed) throw new NotFoundError("room not found"); // anti-enumeration
    }

    // Insert with retry on code collision (probabilistically rare).
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateInviteCode();
      try {
        const created = await prisma.invite.create({
          data: {
            code,
            kind: parsed.data.kind,
            creatorId: userId,
            targetRoomId: parsed.data.targetRoomId ?? null,
            expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
            maxUses: parsed.data.maxUses ?? null,
          },
        });
        reply.status(201).send(toDTO(created));
        return;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }
    throw new Error("failed to generate unique invite code after 3 attempts");
  });

  // List mine
  app.get("/invites", { preHandler: requireAuth }, async (request) => {
    const userId = request.auth!.userId;
    const rows = await prisma.invite.findMany({
      where: { creatorId: userId },
      orderBy: { createdAt: "desc" },
    });
    return { invites: rows.map(toDTO) };
  });

  // Revoke
  app.delete<{ Params: { id: string } }>(
    "/invites/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = idParamSchema.safeParse(request.params);
      if (!parsed.success) throw new ValidationError("invalid id");
      const userId = request.auth!.userId;

      const inv = await prisma.invite.findUnique({
        where: { id: parsed.data.id },
        include: { targetRoom: { select: { ownerId: true } } },
      });
      if (!inv) throw new NotFoundError("invite not found");

      const isCreator = inv.creatorId === userId;
      const isRoomOwner = inv.targetRoom?.ownerId === userId;
      if (!isCreator && !isRoomOwner) throw new ForbiddenError("not allowed to revoke");

      if (inv.revokedAt) {
        reply.status(204).send();
        return;
      }
      await prisma.invite.update({
        where: { id: inv.id },
        data: { revokedAt: new Date() },
      });
      reply.status(204).send();
    },
  );

  const codeParamSchema = z.object({ code: z.string().min(8).max(8) });

  // Public preview — minimal metadata, NO room name leak.
  app.get<{ Params: { code: string } }>(
    "/invites/:code",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request) => {
      const parsed = codeParamSchema.safeParse(request.params);
      if (!parsed.success) throw new ValidationError("invalid code");

      const inv = await prisma.invite.findUnique({
        where: { code: parsed.data.code },
        include: { creator: { select: { handle: true, displayName: true } } },
      });
      if (!inv || !inv.creator.handle) throw new NotFoundError("invite not found");

      return {
        code: inv.code,
        kind: inv.kind,
        creator: { handle: inv.creator.handle, displayName: inv.creator.displayName },
        expiresAt: inv.expiresAt?.toISOString() ?? null,
        maxUses: inv.maxUses,
        uses: inv.uses,
        revokedAt: inv.revokedAt?.toISOString() ?? null,
      };
    },
  );

  // Authed full preview — reveals room name + count when kind=room.
  app.get<{ Params: { code: string } }>(
    "/invites/:code/full",
    { preHandler: requireAuth },
    async (request) => {
      const parsed = codeParamSchema.safeParse(request.params);
      if (!parsed.success) throw new ValidationError("invalid code");

      const inv = await prisma.invite.findUnique({
        where: { code: parsed.data.code },
        include: {
          creator: { select: { handle: true, displayName: true } },
          targetRoom: { select: { id: true, name: true, _count: { select: { memberships: true } } } },
        },
      });
      if (!inv || !inv.creator.handle) throw new NotFoundError("invite not found");

      const base = {
        code: inv.code,
        kind: inv.kind,
        creator: { handle: inv.creator.handle, displayName: inv.creator.displayName },
        expiresAt: inv.expiresAt?.toISOString() ?? null,
        maxUses: inv.maxUses,
        uses: inv.uses,
        revokedAt: inv.revokedAt?.toISOString() ?? null,
      };
      if (inv.kind === "room" && inv.targetRoom) {
        return {
          ...base,
          targetRoom: {
            id: inv.targetRoom.id,
            name: inv.targetRoom.name,
            memberCount: inv.targetRoom._count.memberships,
          },
        };
      }
      return base;
    },
  );
}
