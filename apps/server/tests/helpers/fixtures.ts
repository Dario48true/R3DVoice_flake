import { prisma } from "../../src/db.js";
import { hashPassword } from "../../src/auth/password.js";
import { resetDb as resetDbImpl } from "./db.js";
import type { FastifyInstance } from "fastify";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
}

let counter = 0;

export async function createTestUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
  counter += 1;
  const password = overrides.password ?? "password-password-pw";
  const email = overrides.email ?? `user${counter}@test.local`;
  const displayName = overrides.displayName ?? `user${counter}`;
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, displayName, passwordHash },
  });
  return { id: user.id, email, password, displayName };
}

/** Re-export resetDb so tests can import it from fixtures. */
export { resetDbImpl as resetDb };

export interface RegisteredUser {
  token: string;
  id: string;
  email: string;
}

/**
 * Register a new user via the /auth/register endpoint and return the token.
 * Generates a unique displayName from the email if not provided.
 */
export async function registerUser(
  app: FastifyInstance,
  opts: { email: string; password?: string; displayName?: string },
): Promise<RegisteredUser> {
  const password = opts.password ?? "password-password-pw";
  const displayName = opts.displayName ?? opts.email.split("@")[0] ?? "user";
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: opts.email, password, displayName },
  });
  if (res.statusCode !== 201) {
    throw new Error(`registerUser failed: ${res.statusCode} ${res.body}`);
  }
  const body = res.json();
  return { token: body.token, id: body.user.id, email: opts.email };
}

/** Returns an Authorization header object for use in app.inject calls. */
export function authHeader(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

/** Sets a user's handle via POST /me/handle. Throws on failure. */
export async function setHandle(app: FastifyInstance, token: string, handle: string): Promise<void> {
  const r = await app.inject({
    method: "POST",
    url: "/me/handle",
    headers: { authorization: `Bearer ${token}` },
    payload: { handle },
  });
  if (r.statusCode !== 200) throw new Error(`setHandle failed: ${r.statusCode} ${r.body}`);
}
