-- Private rooms were added to the Prisma schema after the original baseline.
-- IF NOT EXISTS keeps deployment safe for installations previously synchronized
-- with `prisma db push` while making fresh `prisma migrate deploy` complete.
CREATE TABLE IF NOT EXISTS "PrivateRoom" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "ownerId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrivateRoom_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PrivateRoom_slug_key" ON "PrivateRoom"("slug");
CREATE INDEX IF NOT EXISTS "PrivateRoom_ownerId_idx" ON "PrivateRoom"("ownerId");
CREATE INDEX IF NOT EXISTS "PrivateRoom_slug_idx" ON "PrivateRoom"("slug");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PrivateRoom_ownerId_fkey'
    ) THEN
        ALTER TABLE "PrivateRoom" ADD CONSTRAINT "PrivateRoom_ownerId_fkey"
        FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "PlatformConfig" ALTER COLUMN "nameColor2" SET DEFAULT '#172033';
UPDATE "PlatformConfig" SET "nameColor2" = '#172033' WHERE LOWER("nameColor2") IN ('#fff', '#ffffff');
