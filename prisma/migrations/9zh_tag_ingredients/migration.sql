-- Products can be tagged with an ingredient/packaging item directly
ALTER TABLE "RecipeLink" ALTER COLUMN "recipeId" DROP NOT NULL;
ALTER TABLE "RecipeLink" ADD COLUMN "ingredientId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RecipeLink_name_ingredientId_key" ON "RecipeLink"("name", "ingredientId");

-- AddForeignKey
ALTER TABLE "RecipeLink" ADD CONSTRAINT "RecipeLink_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;