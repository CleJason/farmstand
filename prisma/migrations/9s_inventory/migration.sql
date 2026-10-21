-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeLink" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "itemsPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "RecipeLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bake" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batches" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'other',
    "dropId" TEXT,
    "note" TEXT,
    "usage" JSONB NOT NULL DEFAULT '[]',
    "cost" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemOut" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'giveaway',
    "note" TEXT,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockCount_ingredientId_date_idx" ON "StockCount"("ingredientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeLink_name_key" ON "RecipeLink"("name");

-- CreateIndex
CREATE INDEX "Bake_date_idx" ON "Bake"("date");

-- CreateIndex
CREATE INDEX "ItemOut_date_idx" ON "ItemOut"("date");

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLink" ADD CONSTRAINT "RecipeLink_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bake" ADD CONSTRAINT "Bake_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOut" ADD CONSTRAINT "ItemOut_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

