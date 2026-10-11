-- AlterTable
ALTER TABLE "DiscountCode" ADD COLUMN     "allowedEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Thank-you codes already sent for first reviews belong to that reviewer
UPDATE "DiscountCode" d SET "allowedEmails" = ARRAY[r."email"]
FROM "Review" r WHERE r."rewardCode" = d."code" AND r."email" IS NOT NULL;
