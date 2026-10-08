-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "giftAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "giftCode" TEXT;

-- CreateTable
CREATE TABLE "GiftCertificate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "initialAmount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "fromName" TEXT,
    "message" TEXT,
    "purchaserEmail" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GiftCertificate_code_key" ON "GiftCertificate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCertificate_orderId_key" ON "GiftCertificate"("orderId");

