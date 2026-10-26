-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "name" TEXT;


-- Porch Pickup items still around: keep their names on past orders
UPDATE "OrderItem" oi SET "name" = f."name" FROM "FarmstandItem" f WHERE oi."farmstandItemId" = f."id" AND oi."name" IS NULL;
