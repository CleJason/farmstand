-- CreateTable
CREATE TABLE "PastSale" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL,
    "fulfilledAt" TIMESTAMP(3),
    "customer" TEXT,
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "tip" INTEGER NOT NULL DEFAULT 0,
    "fees" INTEGER NOT NULL DEFAULT 0,
    "refunded" INTEGER NOT NULL DEFAULT 0,
    "revenue" INTEGER NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PastSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PastSale_placedAt_idx" ON "PastSale"("placedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PastSale_source_orderNumber_key" ON "PastSale"("source", "orderNumber");

