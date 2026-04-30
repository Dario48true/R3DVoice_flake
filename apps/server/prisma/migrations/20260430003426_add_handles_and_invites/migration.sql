-- AlterTable
ALTER TABLE "User" ADD COLUMN "dndUntil" DATETIME;
ALTER TABLE "User" ADD COLUMN "handle" TEXT;

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "targetRoomId" TEXT,
    "expiresAt" DATETIME,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invite_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invite_targetRoomId_fkey" FOREIGN KEY ("targetRoomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Invite_code_key" ON "Invite"("code");

-- CreateIndex
CREATE INDEX "Invite_code_idx" ON "Invite"("code");

-- CreateIndex
CREATE INDEX "Invite_creatorId_idx" ON "Invite"("creatorId");
