import { costRecipe, unitCosts, type CostIngredient } from "@/lib/costs";
import type { CostsData, PriceBasis } from "@/lib/costs-data";

/**
 * Costs as they were on a date, so a past drop or sale keeps the prices of
 * its time: only purchases made by then count, priced the way the owner had
 * chosen then (average or latest; the switch date is remembered).
 */
export type BasisChange = { from: string; basis: PriceBasis }; // from: ISO date

/** Which price basis applied on `date`. */
export function basisOn(history: BasisChange[], current: PriceBasis, date: Date): PriceBasis {
  if (!history.length) return current;
  let basis = history[0].basis;
  for (const h of history) if (new Date(h.from) <= date) basis = h.basis;
  return basis;
}

/**
 * A cost lookup for `date`: recipe ids → cost per item, ingredient ids → cost
 * per base unit. Results are kept per day, since many sales share a date.
 */
export function costsAsOf(costs: CostsData) {
  const cache = new Map<string, Map<string, number>>();
  return (date: Date): Map<string, number> => {
    // Today or later: today's prices
    const when = date > new Date() ? new Date() : date;
    const day = when.toISOString().slice(0, 10);
    const hit = cache.get(day);
    if (hit) return hit;

    const end = new Date(`${day}T23:59:59.999Z`);
    const basis = basisOn(costs.settings.basisHistory, costs.settings.basis, end);
    const byIngredient = new Map<string, { quantity: number; price: number; date: string }[]>();
    for (const p of costs.purchases) {
      if (new Date(p.date) > end) continue;
      byIngredient.set(p.ingredientId, [...(byIngredient.get(p.ingredientId) ?? []), p]);
    }
    const ingredients = new Map<string, CostIngredient>();
    const table = new Map<string, number>();
    for (const i of costs.ingredients) {
      const c = unitCosts(byIngredient.get(i.id) ?? [], i.manualCost);
      // Nothing bought by then: fall back to today's price rather than free
      const cost = (basis === "latest" ? c.latest : c.average) ?? i.cost;
      ingredients.set(i.id, { ...i, cost });
      table.set(i.id, cost ?? 0);
    }
    for (const r of costs.recipes) table.set(r.id, costRecipe(r, ingredients, costs.settings.overheadRate).perItem);
    cache.set(day, table);
    return table;
  };
}
