import { prisma } from "@/lib/prisma";
import { isPaidStatus } from "@/lib/pickup";
import { loadCosts } from "@/lib/costs-data";
import { linkKey } from "@/lib/costs-plan";

type SoldItem = { name: string; quantity: number; picks?: { name: string; quantity: number }[] };

export type SaleRow = {
  date: string;
  source: string;
  orderNumber: string;
  type: string;
  customer: string;
  items: string;
  subtotal: number; // dollars
  discount: number;
  giftCardUsed: number;
  tip: number;
  tax: number;
  fees: number | null; // null = not known (card fees for shop orders are in Stripe)
  refunded: number;
  revenue: number;
  estCost: number | null; // what it cost to make, from linked recipes (null = nothing linked)
};

/**
 * For the accountant, between `from` (inclusive) and `to` (exclusive): every
 * sale (this shop's paid orders and imported past sales), every receipt, and
 * giveaways, plus a summary by month. Sales get an estimated cost to make
 * from the recipes their products are linked to.
 */
export async function accounting(from: Date, to: Date) {
  const [costs, orders, past, links] = await Promise.all([
    loadCosts(),
    prisma.order.findMany({
      where: { createdAt: { gte: from, lt: to } },
      orderBy: { createdAt: "asc" },
      include: { items: { include: { dropProduct: { include: { product: true } }, farmstandItem: true } }, user: true },
    }),
    prisma.pastSale.findMany({ where: { placedAt: { gte: from, lt: to } }, orderBy: { placedAt: "asc" } }),
    prisma.recipeLink.findMany(),
  ]);
  const perItem = new Map(costs.recipes.map((r) => [r.id, r.cost.perItem]));
  const linkBy = new Map(links.map((l) => [linkKey(l.name), l]));
  const itemCost = (name: string) => {
    const l = linkBy.get(linkKey(name));
    return l ? (perItem.get(l.recipeId) ?? 0) * l.itemsPerUnit : null;
  };
  /** Cost to make what was sold; null when none of it is linked to a recipe. */
  const estCost = (items: SoldItem[]) => {
    let total = 0;
    let known = false;
    for (const i of items) {
      const own = itemCost(i.name);
      if (own !== null) {
        total += own * i.quantity;
        known = true;
      } else {
        for (const p of i.picks ?? []) {
          const c = itemCost(p.name);
          if (c !== null) {
            total += c * p.quantity * i.quantity;
            known = true;
          }
        }
      }
    }
    return known ? Math.round(total * 100) / 100 : null;
  };
  const describe = (items: SoldItem[]) => items.map((i) => `${i.quantity} × ${i.name}`).join("; ");

  const sales: SaleRow[] = [];
  for (const o of orders) {
    if (!isPaidStatus(o.status)) continue;
    const items: SoldItem[] = o.items.map((i) => ({
      name: i.dropProduct?.product.name ?? i.farmstandItem?.name ?? (o.type === "GIFT" ? "Gift card" : "Item"),
      quantity: i.quantity,
      picks: Array.isArray(i.selections) ? (i.selections as { name: string; quantity: number }[]) : undefined,
    }));
    sales.push({
      date: o.createdAt.toISOString().slice(0, 10),
      source: "Shop",
      orderNumber: `#${o.id.slice(-6).toUpperCase()}`,
      type: o.type === "GIFT" ? "Gift card sold" : o.type === "FARMSTAND" ? "Porch Pickup" : "Drop",
      customer: o.guestName || o.user?.name || o.guestEmail || o.user?.email || "",
      items: describe(items),
      subtotal: o.subtotal / 100,
      discount: o.discount / 100,
      giftCardUsed: o.giftAmount / 100,
      tip: 0,
      tax: 0,
      fees: null,
      refunded: 0,
      revenue: o.total / 100,
      estCost: o.type === "GIFT" ? null : estCost(items),
    });
  }
  for (const s of past) {
    const items = (s.items as SoldItem[]) ?? [];
    sales.push({
      date: s.placedAt.toISOString().slice(0, 10),
      source: s.source === "hotplate" ? "Hotplate" : s.source,
      orderNumber: s.orderNumber,
      type: "Drop",
      customer: s.customer ?? "",
      items: describe(items),
      subtotal: s.subtotal / 100,
      discount: s.discount / 100,
      giftCardUsed: 0,
      tip: s.tip / 100,
      tax: s.tax / 100,
      fees: s.fees / 100,
      refunded: s.refunded / 100,
      revenue: s.revenue / 100,
      estCost: estCost(items),
    });
  }
  sales.sort((a, b) => a.date.localeCompare(b.date));

  const inRange = (iso: string) => iso >= from.toISOString() && iso < to.toISOString();
  const expenses = costs.receipts.filter((r) => inRange(r.date)).sort((a, b) => a.date.localeCompare(b.date));
  const giveaways = costs.itemsOut.filter((o) => inRange(o.date)).sort((a, b) => a.date.localeCompare(b.date));

  // By month: money in, money out
  const months = new Map<
    string,
    { revenue: number; tips: number; fees: number; estCost: number; giveaways: number; expenses: Map<string, number> }
  >();
  const month = (d: string) => {
    const k = d.slice(0, 7);
    if (!months.has(k)) months.set(k, { revenue: 0, tips: 0, fees: 0, estCost: 0, giveaways: 0, expenses: new Map() });
    return months.get(k)!;
  };
  for (const s of sales) {
    const m = month(s.date);
    m.revenue += s.revenue;
    m.tips += s.tip;
    m.fees += s.fees ?? 0;
    m.estCost += s.estCost ?? 0;
  }
  for (const r of expenses) {
    const m = month(r.date);
    const cat = r.category || "Uncategorized";
    m.expenses.set(cat, (m.expenses.get(cat) ?? 0) + r.amount / 100);
  }
  for (const g of giveaways) month(g.date).giveaways += g.cost / 100;

  return { sales, expenses, giveaways, months: [...months].sort(([a], [b]) => a.localeCompare(b)) };
}
