-- CreateTable
CREATE TABLE "ReviewOptOut" (
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewOptOut_pkey" PRIMARY KEY ("email")
);
