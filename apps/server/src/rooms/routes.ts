import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth/middleware.js";
import { NotFoundError, ValidationError } from "../errors.js";
import type { Room, RoomMembership } from "@prisma/client";

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

interface RoomResponse {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  isOwner: boolean;
  lastJoined: string | null;
}

function toResponse(
  room: Room,
  currentUserId: string,
  membership: RoomMembership | null,
): RoomResponse {
  return {
    id: room.id,
    name: room.name,
    ownerId: room.ownerId,
    createdAt: room.createdAt.toISOString(),
    isOwner: room.ownerId === currentUserId,
    lastJoined: membership ? membership.lastJoined.toISOString() : null,
  };
}

export async function roomRoutes(app: FastifyInstance): Promise<void> {
  app.post("/rooms", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createRoomSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "invalid input");
    }
    const room = await prisma.room.create({
      data: { name: parsed.data.name, ownerId: request.auth!.userId },
    });
    reply.status(201).send(toResponse(room, request.auth!.userId, null));
  });

  app.get("/rooms", { preHandler: requireAuth }, async (request) => {
    const userId = request.auth!.userId;
    const [owned, memberships] = await Promise.all([
      prisma.room.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "desc" } }),
      prisma.roomMembership.findMany({
        where: { userId, room: { ownerId: { not: userId } } },
        include: { room: true },
        orderBy: { lastJoined: "desc" },
      }),
    ]);
    return {
      owned: owned.map((r) => toResponse(r, userId, null)),
      recent: memberships.map((m) => toResponse(m.room, userId, m)),
    };
  });

  app.get<{ Params: { id: string } }>(
    "/rooms/:id",
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth!.userId;
      const room = await prisma.room.findUnique({ where: { id: request.params.id } });
      if (!room) throw new NotFoundError("room not found");
      const membership = await prisma.roomMembership.findUnique({
        where: { userId_roomId: { userId, roomId: room.id } },
      });
      return toResponse(room, userId, membership);
    },
  );
}
