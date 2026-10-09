-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "boxSize" INTEGER,
ADD COLUMN     "boxOptions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "selections" JSONB;
