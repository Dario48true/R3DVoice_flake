-- DropIndex
DROP INDEX IF EXISTS "User_handle_key";

-- AddColumn
ALTER TABLE "User" ADD COLUMN "handleLower" TEXT;

-- Backfill from existing handles (lowercase any pre-existing values)
UPDATE "User" SET "handleLower" = LOWER("handle") WHERE "handle" IS NOT NULL;

-- CreateIndex (unique on the canonical lowercase form)
CREATE UNIQUE INDEX "User_handleLower_key" ON "User"("handleLower");
