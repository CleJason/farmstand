import { prisma } from "@/lib/prisma";
import { loadCosts } from "@/lib/costs-data";
import { choiceKey, groupLinks, linkedCost, soldItemCost } from "@/lib/costs-plan";
import { dropBoxGroups, dropBoxOptions, isBox } from "@/lib/box";
import { isPaidStatus } from "@/lib/pickup";

export type DropForecast = {
  revenue: number; // dollars if every product with a limit sells out
  profit: number; // dollars, from the products with a known cost
  costedRevenue: number; // the part of revenue that profit covers
  noLimit: string[]; // products with no limit: can't be counted
  noCost: string[]; // products with no recipe linked: revenue counted, cost isn't
  sold: {
    revenue: number; // dollars paid so far, after discounts
    profit: number; // on the items with a known cost, from what was actually picked
    costedRevenue: number;
    noCost: string[]; // sold items with no recipe linked
  };
};

/**
 * What each drop could bring in if it sold out, from its limits and prices.
 * Cost to make comes from linked recipes (ingredients plus overhead). What's
 * in a box isn't known until it's ordered, so its choices are averaged.
 */
export async function dropForecasts(): Promise<Record<string, DropForecast>> {
  const [costs, links, drops] = await Promise.all([
    loadCosts(),
    prisma.recipeLink.findMany(),
    prisma.drop.findMany({
      include: {
        dropProducts: { include: { product: true } },
        orders: { include: { items: { include: { dropProduct: { include: { product: true } } } } } },
      },
    }),
  ]);
  const perItem = new Map([...costs.recipes.map((r) => [r.id, r.cost.perItem] as const), ...costs.ingredients.map((i) => [i.id, i.cost ?? 0] as const)]);
  const linkBy = groupLinks(links);
  const itemCost = (name: string) => linkedCost(name, linkBy, perItem);
  /** Average cost of `size` picks from these choices; null when any choice has no recipe. */
  const pickCost = (box: string, options: string[], size: number) => {
    const each = options.map((o) => itemCost(choiceKey(box, o)) ?? itemCost(o));
    if (each.length === 0 || each.some((c) => c === null)) return null;
    return ((each as number[]).reduce((a, b) => a + b, 0) / each.length) * size;
  };

  const out: Record<string, DropForecast> = {};
  for (const drop of drops) {
    const sold: DropForecast["sold"] = { revenue: 0, profit: 0, costedRevenue: 0, noCost: [] };
    for (const o of drop.orders) {
      if (!isPaidStatus(o.status)) continue;
      sold.revenue += o.total / 100;
      for (const i of o.items) {
        const name = i.dropProduct?.product.name ?? i.name ?? "Item";
        const picks = Array.isArray(i.selections) ? (i.selections as { name: string; quantity: number }[]) : [];
        // Its own recipes plus what went in the box
        const cost = soldItemCost(name, picks, itemCost);
        if (cost === null) {
          if (!sold.noCost.includes(name)) sold.noCost.push(name);
          continue;
        }
        const paid = (i.priceAtPurchase * i.quantity) / 100;
        sold.costedRevenue += paid;
        sold.profit += paid - cost * i.quantity;
      }
    }
    const f: DropForecast = { revenue: 0, profit: 0, costedRevenue: 0, noLimit: [], noCost: [], sold };
    for (const dp of drop.dropProducts) {
      if (dp.quantityLimit === null) {
        f.noLimit.push(dp.product.name);
        continue;
      }
      const price = (dp.priceOverride ?? dp.product.price) / 100;
      f.revenue += price * dp.quantityLimit;

      // Its own recipes, plus for a box the average of its choices (unknown until ordered)
      let cost = itemCost(dp.product.name);
      if (isBox(dp.product)) {
        const groups = dropBoxGroups(dp.product.boxGroups, dp.boxOptions);
        const parts = groups.length
          ? groups.map((g) => pickCost(dp.product.name, g.options, g.size))
          : [pickCost(dp.product.name, dropBoxOptions(dp.product.boxOptions, dp.boxOptions), dp.product.boxSize ?? 0)];
        if (!parts.some((c) => c === null)) cost = (cost ?? 0) + (parts as number[]).reduce((a, b) => a + b, 0);
      }
      if (cost === null) f.noCost.push(dp.product.name);
      else {
        f.profit += (price - cost) * dp.quantityLimit;
        f.costedRevenue += price * dp.quantityLimit;
      }
    }
    out[drop.id] = f;
  }
  return out;
}
