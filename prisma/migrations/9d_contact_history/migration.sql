-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "otherEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "otherPhones" TEXT[] DEFAULT ARRAY[]::TEXT[];
