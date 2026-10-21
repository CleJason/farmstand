-- CreateTable
CREATE TABLE "ScheduledSend" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "smsBody" TEXT,
    "smsPhones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sendAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledSend_sentAt_sendAt_idx" ON "ScheduledSend"("sentAt", "sendAt");

