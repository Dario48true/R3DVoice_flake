import { prisma } from "../../src/db.js";

export async function resetDb(): Promise<void> {
  // Delete in FK-safe order. SQLite doesn't need this strictly, but being explicit is clear.
  await prisma.roomMembership.deleteMany();
  await prisma.room.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
