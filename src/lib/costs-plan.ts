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

export type Link = { recipeId: string; itemsPerUnit: number };

/** Each product / box option's recipes: one can use several (rolls, frosting, streusel…). */
export function groupLinks(links: ({ name: string } & Link)[]): Map<string, Link[]> {
  const by = new Map<string, Link[]>();
  for (const l of links) by.set(linkKey(l.name), [...(by.get(linkKey(l.name)) ?? []), l]);
  return by;
}

/** What one of `name` costs to make: the sum of its tagged recipes; null when it has none. */
export function linkedCost(name: string, links: Map<string, Link[]>, perItem: Map<string, number>): number | null {
  const ls = links.get(linkKey(name));
  if (!ls?.length) return null;
  return ls.reduce((s, l) => s + (perItem.get(l.recipeId) ?? 0) * l.itemsPerUnit, 0);
}

/**
 * Cost to make one sold item: its own tagged recipes (a box's packaging or a
 * fixed part) plus what was picked for it. When a pick has no recipe, only
 * the item's own tags count (null when it has none either).
 */
export function soldItemCost(name: string, picks: { name: string; quantity: number }[] | undefined, cost: (name: string) => number | null) {
  const own = cost(name);
  if (!picks?.length) return own;
  let total = 0;
  for (const p of picks) {
    const c = cost(p.name);
    if (c === null) return own;
    total += c * p.quantity;
  }
  return (own ?? 0) + total;
}

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
export function itemsNeeded(sold: Map<string, Sold>, links: Map<string, Link[]>) {
  const items = new Map<string, number>();
  const unlinked = new Map<string, number>();
  const add = (ls: Link[], n: number) => {
    for (const l of ls) items.set(l.recipeId, (items.get(l.recipeId) ?? 0) + n * l.itemsPerUnit);
  };
  for (const [k, s] of sold) {
    // Its own recipes (a box's packaging, or the whole thing), plus what went in it
    const own = links.get(k);
    if (own?.length) add(own, s.quantity);
    if (s.picks.size) {
      for (const [pk, p] of s.picks) {
        const pl = links.get(pk);
        if (pl?.length) add(pl, p.quantity);
        else if (!own?.length) unlinked.set(p.name, (unlinked.get(p.name) ?? 0) + p.quantity);
      }
    } else if (!own?.length) unlinked.set(s.name, (unlinked.get(s.name) ?? 0) + s.quantity);
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
