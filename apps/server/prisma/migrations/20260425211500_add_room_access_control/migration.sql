-- AlterTable: add Room.isPublic. SQLite-friendly approach (table rebuild).
-- Defaults to false for new rooms, but we backfill existing rows to true so
-- pre-existing rooms stay accessible to anyone who has the link — the
-- previous implicit behavior. Owners can flip individual rooms to private
-- via PATCH /rooms/:id once the new endpoints land.

PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Room" (
    "id"        TEXT    NOT NULL PRIMARY KEY,
    "name"      TEXT    NOT NULL,
    "ownerId"   TEXT    NOT NULL,
    "isPublic"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Room_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Room" ("id", "name", "ownerId", "isPublic", "createdAt")
SELECT "id", "name", "ownerId", 1 AS "isPublic", "createdAt" FROM "Room";

DROP TABLE "Room";
ALTER TABLE "new_Room" RENAME TO "Room";
CREATE INDEX "Room_ownerId_idx" ON "Room"("ownerId");

PRAGMA foreign_keys=ON;
