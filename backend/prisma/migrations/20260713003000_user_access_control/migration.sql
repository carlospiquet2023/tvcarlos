ALTER TABLE "User"
ADD COLUMN "accessBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "accessBlockedAt" TIMESTAMP(3),
ADD COLUMN "accessBlockedReason" TEXT;

CREATE INDEX "User_accessBlocked_idx" ON "User"("accessBlocked");
