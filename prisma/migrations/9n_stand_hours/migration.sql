-- AlterTable
ALTER TABLE "Subscriber" ADD COLUMN     "dropAlerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "standAlerts" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StandHours" (
    "id" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandHours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StandHours_endsAt_idx" ON "StandHours"("endsAt");
