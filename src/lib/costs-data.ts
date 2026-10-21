import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { costRecipe, unitCosts, type CostIngredient } from "@/lib/costs";

export type PriceBasis = "average" | "latest";

/** Admin → Costs settings: the overhead (labor/bake time) rate per hour, and which price to cost with. */
export async function costSettings(): Promise<{ overheadRate: number; basis: PriceBasis }> {
  const [rate, basis] = await Promise.all([getSetting("COST_OVERHEAD_RATE", "15"), getSetting("COST_PRICE_BASIS", "average")]);
  const n = Number(rate);
  return { overheadRate: Number.isFinite(n) && n >= 0 ? n : 15, basis: basis === "latest" ? "latest" : "average" };
}

/** Everything the Costs page shows, with each ingredient's cost and each recipe's totals worked out. */
export async function loadCosts() {
  const [settings, ingredients, purchases, recipes, receipts] = await Promise.all([
    costSettings(),
    prisma.ingredient.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { recipeLines: true } } } }),
    prisma.ingredientPurchase.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    prisma.recipe.findMany({ orderBy: { name: "asc" }, include: { lines: { orderBy: { position: "asc" } } } }),
    prisma.receipt.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
  ]);

  // What's itemized in the purchase log for each receipt: same day, same store
  const itemized = new Map<string, number>();
  for (const p of purchases) {
    const key = `${p.date.toISOString().slice(0, 10)}|${(p.store ?? "").trim().toLowerCase()}`;
    itemized.set(key, (itemized.get(key) ?? 0) + p.price);
  }

  const byIngredient = new Map<string, typeof purchases>();
  for (const p of purchases) byIngredient.set(p.ingredientId, [...(byIngredient.get(p.ingredientId) ?? []), p]);

  const ingredientRows = ingredients.map((i) => {
    const c = unitCosts(byIngredient.get(i.id) ?? [], i.manualCost);
    return {
      id: i.id,
      name: i.name,
      baseUnit: i.baseUnit,
      gramsPerCup: i.gramsPerCup,
      manualCost: i.manualCost,
      purchases: byIngredient.get(i.id)?.length ?? 0,
      usedIn: i._count.recipeLines,
      bought: c.bought,
      spent: c.spent,
      average: c.average,
      latest: c.latest,
      cost: settings.basis === "latest" ? c.latest : c.average,
    };
  });
  const lookup = new Map<string, CostIngredient>(ingredientRows.map((i) => [i.id, i]));

  const recipeRows = recipes.map((r) => ({
    id: r.id,
    name: r.name,
    yieldCount: r.yieldCount,
    yieldLabel: r.yieldLabel,
    overheadHours: r.overheadHours,
    sellPrice: r.sellPrice,
    sellPer: r.sellPer,
    notes: r.notes,
    source: r.source,
    lines: r.lines.map((l) => ({ id: l.id, ingredientId: l.ingredientId, quantity: l.quantity, unit: l.unit, note: l.note })),
    cost: costRecipe(r, lookup, settings.overheadRate),
  }));

  return {
    settings,
    ingredients: ingredientRows,
    purchases: purchases.map((p) => ({
      id: p.id,
      ingredientId: p.ingredientId,
      date: p.date.toISOString(),
      store: p.store,
      quantity: p.quantity,
      price: p.price,
    })),
    recipes: recipeRows,
    receipts: receipts.map((r) => ({
      id: r.id,
      date: r.date.toISOString(),
      vendor: r.vendor,
      amount: r.amount,
      description: r.description,
      category: r.category,
      imageUrl: r.imageUrl,
      itemized: itemized.get(`${r.date.toISOString().slice(0, 10)}|${r.vendor.trim().toLowerCase()}`) ?? 0,
    })),
  };
}

export type CostsData = Awaited<ReturnType<typeof loadCosts>>;
