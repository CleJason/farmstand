import { isAdmin } from "@/lib/admin-input";
import { loadCosts } from "@/lib/costs-data";
import { accounting } from "@/lib/accounting";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => {
  const s = v == null ? "" : typeof v === "number" ? String(Math.round(v * 10000) / 10000) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(esc).join(",")).join("\n");

/**
 * Cost analysis as CSV (opens in Google Sheets / Excel). ?what=recipes (one
 * row per recipe), lines (every ingredient of every recipe), ingredients or receipts.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const params = new URL(req.url).searchParams;
  const what = params.get("what") ?? "recipes";
  const date = new Date().toISOString().slice(0, 10);
  const file = (rows: unknown[][], name: string) =>
    new Response(csv(rows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
    });

  // For the accountant: ?what=sales|expenses|giveaways|summary&from=YYYY-MM-DD&to=YYYY-MM-DD (to included)
  if (["sales", "expenses", "giveaways", "summary"].includes(what)) {
    const year = new Date().getFullYear();
    const from = new Date(`${params.get("from") || `${year}-01-01`}T00:00:00Z`);
    const toDay = new Date(`${params.get("to") || `${year}-12-31`}T00:00:00Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(toDay.getTime())) return new Response("Bad dates", { status: 400 });
    const to = new Date(toDay.getTime() + 86400000);
    const a = await accounting(from, to);
    const range = `${from.toISOString().slice(0, 10)}-to-${toDay.toISOString().slice(0, 10)}`;
    if (what === "sales") {
      return file(
        [
          ["Date", "Source", "Order #", "Type", "Customer", "Items", "Subtotal ($)", "Discount ($)", "Paid with Gift Card ($)", "Tip ($)", "Tax ($)", "Fees ($)", "Refunded ($)", "Revenue ($)", "Est. Cost to Make ($)"],
          ...a.sales.map((s) => [s.date, s.source, s.orderNumber, s.type, s.customer, s.items, s.subtotal, s.discount, s.giftCardUsed, s.tip, s.tax, s.fees ?? "see Stripe", s.refunded, s.revenue, s.estCost]),
        ],
        `sales-${range}.csv`
      );
    }
    if (what === "expenses") {
      return file(
        [
          ["Date", "Vendor", "Category", "What was Purchased", "Amount ($)", "Receipt Photo"],
          ...a.expenses.map((r) => [r.date.slice(0, 10), r.vendor, r.category ?? "Uncategorized", r.description, r.amount / 100, r.imageUrl]),
        ],
        `expenses-${range}.csv`
      );
    }
    if (what === "giveaways") {
      return file(
        [
          ["Date", "What", "How Many", "Why", "Note", "Cost ($)"],
          ...a.giveaways.map((g) => [g.date.slice(0, 10), g.recipeName, g.count, g.reason, g.note, g.cost / 100]),
        ],
        `giveaways-${range}.csv`
      );
    }
    const categories = [...new Set(a.months.flatMap(([, m]) => [...m.expenses.keys()]))].sort();
    const rows: unknown[][] = [
      ["Month", "Sales Revenue ($)", "Tips ($)", "Platform/Card Fees ($)", "Est. Cost to Make ($)", ...categories.map((c) => `Expenses: ${c} ($)`), "Total Expenses ($)", "Giveaways at Cost ($)", "Revenue − Expenses ($)"],
    ];
    for (const [month, m] of a.months) {
      const spent = [...m.expenses.values()].reduce((n, v) => n + v, 0);
      rows.push([month, m.revenue, m.tips, m.fees, m.estCost, ...categories.map((c) => m.expenses.get(c) ?? 0), spent, m.giveaways, m.revenue - spent]);
    }
    return file(rows, `summary-${range}.csv`);
  }

  const { recipes, ingredients, settings, receipts } = await loadCosts();
  const names = new Map(ingredients.map((i) => [i.id, i]));
  let rows: unknown[][];
  if (what === "receipts") {
    rows = [
      ["Date", "Vendor", "Amount ($)", "What was Purchased", "Category", "Itemized in Purchases ($)", "Receipt Photo"],
      ...receipts.map((r) => [r.date.slice(0, 10), r.vendor, r.amount / 100, r.description, r.category, r.itemized / 100, r.imageUrl]),
    ];
  } else if (what === "ingredients") {
    rows = [
      ["Ingredient / Item", "Base Unit", "Grams per Cup", "Purchases", "Total Bought", "Total Spent ($)", "Average Cost per Unit ($)", "Latest Cost per Unit ($)", "Used In (lines)"],
      ...ingredients.map((i) => [i.name, i.baseUnit, i.gramsPerCup, i.purchases, i.bought, i.spent, i.average, i.latest, i.usedIn]),
    ];
  } else if (what === "lines") {
    rows = [["Recipe", "Ingredient / Item", "Quantity", "Unit", "Cost per Base Unit ($)", "Line Total ($)", "Note"]];
    for (const r of recipes) {
      r.lines.forEach((l, i) => {
        const c = r.cost.lines[i];
        rows.push([r.name, names.get(l.ingredientId)?.name ?? "?", l.quantity, l.unit, names.get(l.ingredientId)?.cost, c.cost, c.problem ?? ("estimated" in c && c.estimated ? "estimated (no grams per cup)" : "")]);
      });
      if (r.overheadHours) rows.push([r.name, "Bake Hour Overhead", r.overheadHours, "hr", settings.overheadRate, r.cost.overhead, ""]);
    }
  } else {
    rows = [
      ["Recipe", "Makes", "Ingredients ($)", "Overhead ($)", "Batch Cost ($)", "Cost per Item ($)", "Batch Price ($)", "Gross Profit ($)", "Margin %"],
      ...recipes.map((r) => [
        r.name,
        `${r.yieldCount} ${r.yieldLabel}`,
        r.cost.ingredientsCost,
        r.cost.overhead,
        r.cost.batch,
        r.cost.perItem,
        r.cost.batchPrice,
        r.cost.profit,
        r.cost.margin,
      ]),
    ];
  }
  return file(rows, `costs-${what}-${date}.csv`);
}
