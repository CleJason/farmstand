import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { costRecipe, unitCosts, type CostIngredient } from "@/lib/costs";
import { soldNames } from "@/lib/costs-plan";

export type PriceBasis = "average" | "latest";

/** Admin → Costs settings: the overhead (labor/bake time) rate per hour, and which price to cost with. */
export async function costSettings(): Promise<{ overheadRate: number; basis: PriceBasis }> {
  const [rate, basis] = await Promise.all([getSetting("COST_OVERHEAD_RATE", "15"), getSetting("COST_PRICE_BASIS", "average")]);
  const n = Number(rate);
  return { overheadRate: Number.isFinite(n) && n >= 0 ? n : 15, basis: basis === "latest" ? "latest" : "average" };
}

type Usage = { ingredientId: string; amount: number }[];

/** Everything the Costs page shows, with each ingredient's cost and each recipe's totals worked out. */
export async function loadCosts() {
  const [settings, ingredients, purchases, recipes, receipts, counts, bakes, itemsOut, names, drops] = await Promise.all([
    costSettings(),
    prisma.ingredient.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { recipeLines: true } } } }),
    prisma.ingredientPurchase.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    prisma.recipe.findMany({ orderBy: { name: "asc" }, include: { lines: { orderBy: { position: "asc" } }, links: true } }),
    prisma.receipt.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    prisma.stockCount.findMany({ orderBy: { date: "desc" } }),
    prisma.bake.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    prisma.itemOut.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    soldNames(),
    prisma.drop.findMany({
      where: { status: { not: "DRAFT" } },
      orderBy: { orderOpenAt: "desc" },
      take: 8,
      select: { id: true, title: true, orderOpenAt: true, orderCloseAt: true },
    }),
  ]);

  // What's itemized in the purchase log for each receipt: same day, same store
  const itemized = new Map<string, number>();
  for (const p of purchases) {
    const key = `${p.date.toISOString().slice(0, 10)}|${(p.store ?? "").trim().toLowerCase()}`;
    itemized.set(key, (itemized.get(key) ?? 0) + p.price);
  }

  const byIngredient = new Map<string, typeof purchases>();
  for (const p of purchases) byIngredient.set(p.ingredientId, [...(byIngredient.get(p.ingredientId) ?? []), p]);

  // On hand = the latest shelf count + purchases since − what bakes since used. Unknown until counted once.
  const lastCount = new Map<string, (typeof counts)[number]>();
  for (const c of counts) if (!lastCount.has(c.ingredientId)) lastCount.set(c.ingredientId, c);
  const usedSince = new Map<string, number>();
  for (const b of bakes) {
    for (const u of (b.usage as Usage) ?? []) {
      const c = lastCount.get(u.ingredientId);
      if (c && b.date > c.date) usedSince.set(u.ingredientId, (usedSince.get(u.ingredientId) ?? 0) + u.amount);
    }
  }
  const onHand = (id: string) => {
    const c = lastCount.get(id);
    if (!c) return null;
    const bought = (byIngredient.get(id) ?? []).filter((p) => p.date > c.date).reduce((n, p) => n + p.quantity, 0);
    return c.amount + bought - (usedSince.get(id) ?? 0);
  };

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
      onHand: onHand(i.id),
      countedAt: lastCount.get(i.id)?.date.toISOString() ?? null,
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
    links: r.links.map((l) => ({ name: l.name, itemsPerUnit: l.itemsPerUnit })),
    cost: costRecipe(r, lookup, settings.overheadRate),
  }));
  const recipeName = new Map(recipes.map((r) => [r.id, r.name]));

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
    bakes: bakes.slice(0, 300).map((b) => ({
      id: b.id,
      recipeId: b.recipeId,
      recipeName: recipeName.get(b.recipeId) ?? "?",
      date: b.date.toISOString(),
      batches: b.batches,
      reason: b.reason,
      dropId: b.dropId,
      note: b.note,
      cost: b.cost,
    })),
    itemsOut: itemsOut.slice(0, 300).map((o) => ({
      id: o.id,
      recipeId: o.recipeId,
      recipeName: recipeName.get(o.recipeId) ?? "?",
      date: o.date.toISOString(),
      count: o.count,
      reason: o.reason,
      note: o.note,
      cost: o.cost,
    })),
    soldNames: names,
    drops: drops.map((d) => ({ id: d.id, title: d.title, orderOpenAt: d.orderOpenAt.toISOString(), orderCloseAt: d.orderCloseAt.toISOString() })),
  };
}

export type CostsData = Awaited<ReturnType<typeof loadCosts>>;
