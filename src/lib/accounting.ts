import { prisma } from "@/lib/prisma";
import { isPaidStatus } from "@/lib/pickup";
import { loadCosts } from "@/lib/costs-data";
import { costsAsOf } from "@/lib/costs-asof";
import { groupLinks, linkedCost, soldItemCost } from "@/lib/costs-plan";

type SoldItem = { name: string; quantity: number; picks?: { name: string; quantity: number }[]; addOns?: { name: string; price: number }[] };

export type SaleRow = {
  date: string;
  source: string;
  orderNumber: string;
  type: string;
  customer: string;
  items: string;
  payment: string; // Card, Venmo, PayPal, Gift card…
  lines: { name: string; quantity: number; amount: number | null }[]; // amount = dollars, when known
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
  // Each sale is costed at the prices of its day, so new prices don't rewrite old profit
  const asOf = costsAsOf(costs);
  let perItem = asOf(new Date());
  const linkBy = groupLinks(links);
  const itemCost = (name: string) => linkedCost(name, linkBy, perItem);
  /** Cost to make what was sold; null unless every item has recipes tagged (so profit isn't overstated). */
  const estCost = (items: SoldItem[], on: Date) => {
    perItem = asOf(on);
    let total = 0;
    for (const i of items) {
      const c = soldItemCost(i.name, i.picks, itemCost, i.addOns?.map((a) => a.name));
      if (c === null) return null;
      total += c * i.quantity;
    }
    return items.length ? Math.round(total * 100) / 100 : null;
  };
  const describe = (items: SoldItem[]) => items.map((i) => `${i.quantity} × ${i.name}`).join("; ");
  // The shop's day, not UTC: an 9 PM order belongs to that evening
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "America/New_York" }).format(d);
  const PAYMENT: Record<string, string> = { STRIPE: "Card", VENMO: "Venmo", PAYPAL: "PayPal", CASH: "Cash" };

  const sales: SaleRow[] = [];
  for (const o of orders) {
    if (!isPaidStatus(o.status)) continue;
    const items: SoldItem[] = o.items.map((i) => ({
      name: i.dropProduct?.product.name ?? i.farmstandItem?.name ?? i.name ?? (o.type === "GIFT" ? "Gift card" : "Item"),
      quantity: i.quantity,
      picks: Array.isArray(i.selections) ? (i.selections as { name: string; quantity: number }[]) : undefined,
      addOns: Array.isArray(i.addOns) ? (i.addOns as { name: string; price: number }[]) : undefined,
    }));
    // By product: each add-on is its own line ("+ Extra Icing"), taken out of its item's amount
    const lines = o.items.flatMap((i, n) => {
      const extras = items[n].addOns ?? [];
      const extraEach = extras.reduce((s, a) => s + (Number(a.price) || 0), 0);
      return [
        { name: items[n].name, quantity: i.quantity, amount: ((i.priceAtPurchase - extraEach) * i.quantity) / 100 },
        ...extras.map((a) => ({ name: `+ ${a.name}`, quantity: i.quantity, amount: ((Number(a.price) || 0) * i.quantity) / 100 })),
      ];
    });
    sales.push({
      date: day(o.createdAt),
      source: "Shop",
      orderNumber: `#${o.id.slice(-6).toUpperCase()}`,
      type: o.type === "GIFT" ? "Gift card sold" : o.type === "FARMSTAND" ? "Porch Pickup" : "Drop",
      customer: o.guestName || o.user?.name || o.guestEmail || o.user?.email || "",
      items: describe(items),
      payment: o.total === 0 && o.giftAmount > 0 ? "Gift card" : PAYMENT[o.paymentMethod] ?? o.paymentMethod,
      lines,
      subtotal: o.subtotal / 100,
      discount: o.discount / 100,
      giftCardUsed: o.giftAmount / 100,
      tip: 0,
      tax: 0,
      fees: null,
      refunded: 0,
      revenue: o.total / 100,
      estCost: o.type === "GIFT" ? null : estCost(items, o.createdAt),
    });
  }
  for (const s of past) {
    const items = (s.items as SoldItem[]) ?? [];
    sales.push({
      // Imported dates are already the shop's day (stored at noon UTC)
      date: s.placedAt.toISOString().slice(0, 10),
      // "Imported" (from Hotplate or wherever); the platform is noted with the kind
      source: "Imported",
      orderNumber: s.orderNumber,
      type: `Drop (${s.source === "hotplate" ? "Hotplate" : s.source})`,
      customer: s.customer ?? "",
      items: describe(items),
      payment: "Card",
      lines: items.map((i) => ({ name: i.name, quantity: i.quantity, amount: null })),
      subtotal: s.subtotal / 100,
      discount: s.discount / 100,
      giftCardUsed: 0,
      tip: s.tip / 100,
      tax: s.tax / 100,
      fees: s.fees / 100,
      refunded: s.refunded / 100,
      revenue: s.revenue / 100,
      estCost: estCost(items, s.placedAt),
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
