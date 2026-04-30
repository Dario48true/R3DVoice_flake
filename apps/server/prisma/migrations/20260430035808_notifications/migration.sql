-- AddColumns
ALTER TABLE "User" ADD COLUMN "currentRoomId" TEXT REFERENCES "Room"("id") ON DELETE SET NULL;
ALTER TABLE "Message" ADD COLUMN "mentions" TEXT;

-- CreateTable
CREATE TABLE "ThreadReadState" (
    "userId" TEXT NOT NULL,
    "threadType" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "lastReadAt" DATETIME NOT NULL,
    PRIMARY KEY ("userId", "threadType", "threadId"),
    CONSTRAINT "ThreadReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ThreadReadState_userId_idx" ON "ThreadReadState"("userId");

CREATE TABLE "ThreadMuteState" (
    "userId" TEXT NOT NULL,
    "threadType" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "mutedUntil" DATETIME,
    PRIMARY KEY ("userId", "threadType", "threadId"),
    CONSTRAINT "ThreadMuteState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ThreadMuteState_userId_idx" ON "ThreadMuteState"("userId");

CREATE INDEX "User_currentRoomId_idx" ON "User"("currentRoomId");
