import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { getConfig } from "../config.js";
import { hashPassword } from "./password.js";
import { signSessionToken } from "./jwt.js";
import { ConflictError, ValidationError } from "../errors.js";

const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, "password must be at least 12 characters"),
  displayName: z.string().min(1).max(50),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (request, reply) => {
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
  });
}
