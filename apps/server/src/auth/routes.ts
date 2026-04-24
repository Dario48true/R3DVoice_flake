import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { getConfig } from "../config.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signSessionToken } from "./jwt.js";
import { requireAuth } from "./middleware.js";
import { AuthError, ConflictError, ValidationError } from "../errors.js";

const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, "password must be at least 12 characters"),
  displayName: z.string().min(1).max(50),
});

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/auth/register",
    {
      config: {
        rateLimit: { max: 5, timeWindow: "1 hour" },
      },
    },
    async (request, reply) => {
      const parsed = registerBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? "invalid input");
      }
      const { email, password, displayName } = parsed.data;
      const passwordHash = await hashPassword(password);
      let user;
      try {
        user = await prisma.user.create({
          data: { email, displayName, passwordHash },
        });
      } catch (err) {
        // P2002 = Prisma unique-constraint violation (here: User.email)
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new ConflictError("email already registered");
        }
        throw err;
      }
      const session = await prisma.session.create({ data: { userId: user.id } });
      const token = signSessionToken(
        { userId: user.id, sessionId: session.id },
        getConfig().JWT_SECRET,
      );
      reply.status(201).send({
        token,
        user: { id: user.id, email: user.email, displayName: user.displayName },
      });
    },
  );

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("invalid input");
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AuthError("invalid credentials");
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      throw new AuthError("invalid credentials");
    }

    const session = await prisma.session.create({ data: { userId: user.id } });
    const token = signSessionToken(
      { userId: user.id, sessionId: session.id },
      getConfig().JWT_SECRET,
    );
    reply.status(200).send({
      token,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
  });

  app.get("/me", { preHandler: requireAuth }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.auth!.userId } });
    if (!user) throw new AuthError("user not found");
    return { id: user.id, email: user.email, displayName: user.displayName };
  });

  app.post("/auth/logout", { preHandler: requireAuth }, async (request, reply) => {
    await prisma.session.update({
      where: { id: request.auth!.sessionId },
      data: { revokedAt: new Date() },
    });
    reply.status(204).send();
  });
}
