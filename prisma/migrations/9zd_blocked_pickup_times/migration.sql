-- AlterTable
ALTER TABLE "PickupSlot" ADD COLUMN     "blockedTimes" TEXT[] DEFAULT ARRAY[]::TEXT[];

