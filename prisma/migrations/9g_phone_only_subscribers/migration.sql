-- AlterTable: people can be on the alert list with just a phone number
ALTER TABLE "Subscriber" ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Subscriber_phone_idx" ON "Subscriber"("phone");
