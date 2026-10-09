-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "email" TEXT,
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "rewardCode" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "reviewToken" TEXT,
ADD COLUMN     "reviewRequestedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Review_orderId_key" ON "Review"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_reviewToken_key" ON "Order"("reviewToken");
