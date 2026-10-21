import { isAdmin } from "@/lib/admin-input";
import { loadCosts } from "@/lib/costs-data";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => {
  const s = v == null ? "" : typeof v === "number" ? String(Math.round(v * 10000) / 10000) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(esc).join(",")).join("\n");

/**
 * Cost analysis as CSV (opens in Google Sheets / Excel). ?what=recipes (one
 * row per recipe), lines (every ingredient of every recipe) or ingredients.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const what = new URL(req.url).searchParams.get("what") ?? "recipes";
  const { recipes, ingredients, settings } = await loadCosts();
  const names = new Map(ingredients.map((i) => [i.id, i]));
  let rows: unknown[][];
  if (what === "ingredients") {
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
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="costs-${what}-${date}.csv"`,
    },
  });
}
