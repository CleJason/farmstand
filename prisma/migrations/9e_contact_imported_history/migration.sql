-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "importedOrders" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "importedSpent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "firstOrderAt" TIMESTAMP(3),
ADD COLUMN     "lastOrderAt" TIMESTAMP(3),
ADD COLUMN     "customerSince" TIMESTAMP(3),
ADD COLUMN     "note" TEXT;
