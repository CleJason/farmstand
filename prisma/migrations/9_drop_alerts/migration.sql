-- AlterTable
ALTER TABLE "Drop" ADD COLUMN     "announcedAt" TIMESTAMP(3);

-- Drops already published before alerts existed don't get announced after the fact
UPDATE "Drop" SET "announcedAt" = CURRENT_TIMESTAMP WHERE "status" <> 'DRAFT';

-- CreateTable
CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "unsubscribeToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_email_key" ON "Subscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_unsubscribeToken_key" ON "Subscriber"("unsubscribeToken");
