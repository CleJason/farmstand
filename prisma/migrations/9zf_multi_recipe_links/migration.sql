-- A product can use several recipes (rolls + frosting)
DROP INDEX "RecipeLink_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "RecipeLink_name_recipeId_key" ON "RecipeLink"("name", "recipeId");
