-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "reviewVia" TEXT;

-- Requests before texts were added (Oct 24, 2026) all went by email
UPDATE "Order" SET "reviewVia" = 'email' WHERE "reviewRequestedAt" < '2026-10-24' AND "reviewVia" IS NULL;
