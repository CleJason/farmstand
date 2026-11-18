import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { loadCosts } from "@/lib/costs-data";
import { linkKey } from "@/lib/costs-plan";
import { CostInputError, positive } from "@/lib/costs-input";

/**
 * Admin → Costs → Products: the recipes one product (or box choice) uses.
 * `name` plus `links` [{ recipeId, itemsPerUnit }], e.g. Sunday Roll 4-pack:
 * 4 cinnamon rolls + 4 rolls' worth of frosting. Replaces what it had.
 */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const data = await req.json().catch(() => ({}));
    const name = linkKey(String(data.name ?? "")).slice(0, 120);
    if (!name) throw new CostInputError("Which product?");
    const [recipes, ingredients] = await Promise.all([
      prisma.recipe.findMany({ select: { id: true } }),
      prisma.ingredient.findMany({ select: { id: true } }),
    ]);
    const knownRecipe = new Set(recipes.map((r) => r.id));
    const knownIngredient = new Set(ingredients.map((i) => i.id));
    const raw: unknown[] = Array.isArray(data.links) ? data.links.slice(0, 30) : [];
    // Keyed "r:<id>" or "i:<id>" so the same thing tagged twice adds up
    const links = new Map<string, number>();
    for (const r of raw) {
      const l = (r ?? {}) as Record<string, unknown>;
      const key = l.ingredientId ? `i:${l.ingredientId}` : `r:${l.recipeId ?? ""}`;
      const id = key.slice(2);
      if (key.startsWith("i:") ? !knownIngredient.has(id) : !knownRecipe.has(id)) continue;
      links.set(key, (links.get(key) ?? 0) + positive(l.itemsPerUnit ?? 1, "How much it uses")!);
    }
    await prisma.$transaction([
      prisma.recipeLink.deleteMany({ where: { name } }),
      prisma.recipeLink.createMany({
        data: [...links].map(([key, itemsPerUnit]) =>
          key.startsWith("i:") ? { name, ingredientId: key.slice(2), itemsPerUnit } : { name, recipeId: key.slice(2), itemsPerUnit }
        ),
      }),
    ]);
    return NextResponse.json(await loadCosts());
  } catch (e) {
    return NextResponse.json({ error: e instanceof CostInputError ? e.message : "Couldn't save that" }, { status: 400 });
  }
}
