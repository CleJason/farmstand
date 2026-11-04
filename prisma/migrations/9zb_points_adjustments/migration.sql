-- CreateTable
CREATE TABLE "PointsAdjustment" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointsAdjustment_email_idx" ON "PointsAdjustment"("email");

-- CreateIndex
CREATE INDEX "PointsAdjustment_phone_idx" ON "PointsAdjustment"("phone");

