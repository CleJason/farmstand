import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { loadCosts } from "@/lib/costs-data";
import { batchUsage, itemsNeeded, linkKey, soldInDrop } from "@/lib/costs-plan";

export const dynamic = "force-dynamic";

/**
 * Bake plan for a drop (?dropId=): what was ordered, how many of each recipe
 * that takes (in batches), the ingredients for it against what's on hand, and
 * what's already been logged as baked for the drop.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dropId = new URL(req.url).searchParams.get("dropId") ?? "";
  const [costs, sold, links, logged] = await Promise.all([
    loadCosts(),
    soldInDrop(dropId),
    prisma.recipeLink.findMany(),
    prisma.bake.findMany({ where: { dropId }, select: { recipeId: true, batches: true } }),
  ]);
  const { items, unlinked } = itemsNeeded(sold, new Map(links.map((l) => [linkKey(l.name), l])));
  const ingredients = new Map(costs.ingredients.map((i) => [i.id, i]));
  const need = new Map<string, number>();
  const recipes = [...items].map(([recipeId, count]) => {
    const r = costs.recipes.find((x) => x.id === recipeId)!;
    const batches = count / (r.yieldCount || 1);
    // Ingredients for what would actually be baked: rounded up to the next half batch
    const toBake = Math.ceil(batches * 2) / 2;
    for (const [ingId, amount] of batchUsage(r.lines, ingredients)) need.set(ingId, (need.get(ingId) ?? 0) + amount * toBake);
    return {
      recipeId,
      name: r.name,
      items: count,
      yieldCount: r.yieldCount,
      yieldLabel: r.yieldLabel,
      batches,
      logged: logged.filter((b) => b.recipeId === recipeId).reduce((n, b) => n + b.batches, 0),
    };
  });
  return NextResponse.json({
    sold: [...sold.values()].map((s) => ({ name: s.name, quantity: s.quantity, picks: [...s.picks.values()] })),
    recipes: recipes.sort((a, b) => a.name.localeCompare(b.name)),
    unlinked: [...unlinked].map(([name, quantity]) => ({ name, quantity })),
    ingredients: [...need]
      .map(([id, amount]) => {
        const i = ingredients.get(id)!;
        return { id, name: i.name, baseUnit: i.baseUnit, need: amount, onHand: i.onHand };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    loggedOther: logged.filter((b) => !items.has(b.recipeId)).length,
  });
}
