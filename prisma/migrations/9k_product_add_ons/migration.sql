-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "addOns" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "addOns" JSONB;
