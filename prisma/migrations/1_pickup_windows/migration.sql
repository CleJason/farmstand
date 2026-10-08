-- AlterTable
ALTER TABLE "PickupSlot" ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "intervalMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "maxPerTime" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "pickupTime" TIMESTAMP(3);
