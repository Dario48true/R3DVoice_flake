import { prisma } from "../../src/db.js";
import { hashPassword } from "../../src/auth/password.js";

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
