import { prisma } from "@/lib/prisma";
import { countsStock } from "@/lib/stock";
import { toBase } from "@/lib/costs";

type LineLike = { ingredientId: string; quantity: number; unit: string };
type IngredientLike = { id: string; baseUnit: string; gramsPerCup: number | null };

/** What one batch of a recipe uses, per ingredient, in base units (lines that can't convert are left out). */
export function batchUsage(lines: LineLike[], ingredients: Map<string, IngredientLike>): Map<string, number> {
  const use = new Map<string, number>();
  for (const l of lines) {
    const ing = ingredients.get(l.ingredientId);
    if (!ing) continue;
    const b = toBase(l.quantity, l.unit, ing);
    if (!b.error) use.set(ing.id, (use.get(ing.id) ?? 0) + b.amount);
  }
  return use;
}

/** Links are matched by name, any case: a product name or a box option. */
export const linkKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

export type Sold = { name: string; quantity: number; picks: Map<string, { name: string; quantity: number }> };

/**
 * Everything ordered in a drop (paid or awaiting Venmo/PayPal), per product,
 * with what went into the boxes: "6-Cookie Box" × 3, of which 9 Chocolate Chip, 9 Biscoff.
 */
export async function soldInDrop(dropId: string): Promise<Map<string, Sold>> {
  const orders = await prisma.order.findMany({
    where: { dropId },
    select: { status: true, items: { select: { quantity: true, selections: true, dropProduct: { select: { product: { select: { name: true } } } } } } },
  });
  const sold = new Map<string, Sold>();
  for (const o of orders) {
    if (!countsStock(o.status)) continue;
    for (const i of o.items) {
      const product = i.dropProduct?.product.name;
      if (!product) continue;
      const k = linkKey(product);
      const entry = sold.get(k) ?? { name: product, quantity: 0, picks: new Map() };
      entry.quantity += i.quantity;
      const picks = Array.isArray(i.selections) ? (i.selections as { name?: string; quantity?: number }[]) : [];
      for (const p of picks) {
        if (!p?.name || !(Number(p.quantity) > 0)) continue;
        const pk = linkKey(String(p.name));
        const prev = entry.picks.get(pk);
        entry.picks.set(pk, { name: prev?.name ?? String(p.name), quantity: (prev?.quantity ?? 0) + Number(p.quantity) * i.quantity });
      }
      sold.set(k, entry);
    }
  }
  return sold;
}

/**
 * How many of each recipe's items a drop needs, from its links: a linked
 * product counts as itself; an unlinked box counts by what's in it. Names
 * with no recipe come back in `unlinked`.
 */
export function itemsNeeded(sold: Map<string, Sold>, links: Map<string, { recipeId: string; itemsPerUnit: number }>) {
  const items = new Map<string, number>();
  const unlinked = new Map<string, number>();
  const add = (recipeId: string, n: number) => items.set(recipeId, (items.get(recipeId) ?? 0) + n);
  for (const [k, s] of sold) {
    const link = links.get(k);
    if (link) add(link.recipeId, s.quantity * link.itemsPerUnit);
    else if (s.picks.size) {
      for (const [pk, p] of s.picks) {
        const pl = links.get(pk);
        if (pl) add(pl.recipeId, p.quantity * pl.itemsPerUnit);
        else unlinked.set(p.name, (unlinked.get(p.name) ?? 0) + p.quantity);
      }
    } else unlinked.set(s.name, (unlinked.get(s.name) ?? 0) + s.quantity);
  }
  return { items, unlinked };
}

/** The names a recipe can be sold as: every product, and every box option. */
export async function soldNames(): Promise<string[]> {
  const products = await prisma.product.findMany({ select: { name: true, boxOptions: true, boxSize: true } });
  const names = new Map<string, string>();
  for (const p of products) {
    names.set(linkKey(p.name), p.name);
    if (p.boxSize) for (const o of p.boxOptions) names.set(linkKey(o), o);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
