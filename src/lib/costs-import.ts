import { baseUnitFor, nameKey, normalizeUnit, type BaseUnit } from "@/lib/costs";
import { sheetDate, type Sheet } from "@/lib/xlsx-read";

export type ImportIngredient = { name: string; baseUnit: BaseUnit; manualCost?: number | null };
export type ImportPurchase = { name: string; date: string; store: string | null; quantity: number; unit: string; price: number };
export type ImportLine = { ingredientName: string; ingredientId?: string; quantity: number; unit: string; note?: string | null };
export type ImportRecipe = {
  name: string;
  yieldCount: number;
  yieldLabel: string;
  overheadHours: number;
  sellPrice: number | null;
  sellPer: "batch" | "item";
  notes?: string | null;
  source: "sheet" | "mealie";
  lines: ImportLine[];
};
export type ImportReceipt = { date: string; vendor: string; amount: number; description: string | null; category: string | null };
/** A sale from another platform's order export (dollars) */
export type ImportPastSale = {
  source: string;
  orderNumber: string;
  placedAt: string;
  fulfilledAt: string | null;
  customer: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  tip: number;
  fees: number;
  refunded: number;
  revenue: number;
  items: { name: string; quantity: number }[];
};
export type ImportPlan = {
  ingredients: ImportIngredient[];
  purchases: ImportPurchase[];
  recipes: ImportRecipe[];
  receipts?: ImportReceipt[];
  pastSales?: ImportPastSale[];
  overheadRate?: number;
  notes: string[];
};

const str = (v: unknown) => (v == null ? "" : String(v).trim());
const number = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(str(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const isOverhead = (name: string, unit: string) => /overhead|labor|labour/i.test(name) || unit.toLowerCase() === "hr";
const plural = (word: string, n: number) => {
  const w = word.toLowerCase();
  if (n === 1 || w.endsWith("s")) return w;
  if (w.endsWith("f")) return `${w.slice(0, -1)}ves`; // loaf → loaves
  if (w.endsWith("y")) return `${w.slice(0, -1)}ies`;
  return `${w}s`;
};

/** The row index (and column map) of the first row whose cells match all `tests`. */
function findHeader(sheet: Sheet, tests: RegExp[]) {
  for (let r = 0; r < Math.min(sheet.rows.length, 30); r++) {
    const row = sheet.rows[r].map((c) => str(c).toLowerCase());
    if (tests.every((t) => row.some((c) => t.test(c)))) return { row: r, cols: row };
  }
  return null;
}
const col = (cols: string[], ...tests: RegExp[]) => {
  for (const t of tests) {
    const i = cols.findIndex((c) => t.test(c));
    if (i >= 0) return i;
  }
  return -1;
};

/**
 * A cost-analyzer workbook like Made For Sunday's: a purchase log (Date,
 * Store, Ingredient / Item, Quantity Purchased, Base Unit, Total Price Paid),
 * an inventory pool (for items never bought, like overhead), and one tab per
 * recipe (Item Name, Quantity Used, Unit… "Total Batch Cost", "Cost Per X
 * (÷ N)", and a Bundle / Retail Price row).
 */
export function planFromWorkbook(sheets: Sheet[]): ImportPlan {
  const plan: ImportPlan = { ingredients: [], purchases: [], recipes: [], receipts: [], pastSales: [], notes: [] };
  const bought = new Set<string>();

  // A Hotplate orders export: one row per order, then a column per menu item with how many
  for (const sheet of sheets) {
    const h = findHeader(sheet, [/^order number$/, /^date placed$/, /^total revenue$/]);
    if (!h) continue;
    const header = sheet.rows[h.row].map((x) => str(x));
    const c = (name: string) => h.cols.indexOf(name);
    const money = (row: (string | number | null)[], name: string) => {
      const n = number(row[c(name)]);
      return Number.isFinite(n) ? n : 0;
    };
    // Item columns come after the address columns
    const firstItem = Math.max(c("fulfillment zip"), c("fulfillment state"), c("chef hotplate fee")) + 1;
    let undated = 0;
    for (const row of sheet.rows.slice(h.row + 1)) {
      const orderNumber = str(row[c("order number")]);
      if (!orderNumber) continue;
      const placedAt = sheetDate(row[c("date placed")] ?? null) ?? sheetDate(row[c("date fulfilled")] ?? null);
      if (!placedAt) {
        undated++;
        continue;
      }
      const items: { name: string; quantity: number }[] = [];
      for (let i = firstItem; i < header.length; i++) {
        const q = number(row[i]);
        if (header[i] && q > 0) items.push({ name: header[i].replace(/\s*\p{Extended_Pictographic}/gu, "").trim(), quantity: q });
      }
      plan.pastSales!.push({
        source: "hotplate",
        orderNumber,
        placedAt,
        fulfilledAt: sheetDate(row[c("date fulfilled")] ?? null),
        customer: str(row[c("customer name")]) || null,
        subtotal: money(row, "subtotal"),
        discount: money(row, "discount applied to subtotal"),
        tax: money(row, "tax"),
        tip: money(row, "tip"),
        fees: money(row, "chef payment processing fee") + money(row, "chef hotplate fee"),
        refunded: money(row, "refund total"),
        revenue: money(row, "total revenue"),
        items,
      });
    }
    if (undated) plan.notes.push(`${sheet.name}: ${undated} order${undated === 1 ? " has" : "s have"} no date and ${undated === 1 ? "was" : "were"} skipped.`);
  }

  // A receipt / expense log: Date, Vendor (or Store), Amount (or Total), What was Purchased
  for (const sheet of sheets) {
    const h = findHeader(sheet, [/^date/, /vendor|store|merchant/, /amount|total/]);
    if (!h || h.cols.some((c) => /quantity|qty|order number/.test(c))) continue;
    const c = {
      date: col(h.cols, /^date/),
      vendor: col(h.cols, /vendor|store|merchant/),
      amount: col(h.cols, /amount|total/),
      what: col(h.cols, /what|description|items|purchased|notes?$/),
      category: col(h.cols, /category|type/),
    };
    for (const row of sheet.rows.slice(h.row + 1)) {
      const date = sheetDate(row[c.date] ?? null);
      const vendor = str(row[c.vendor]);
      const amount = number(row[c.amount]);
      if (!date || !vendor || !(amount >= 0)) continue; // also skips a total row at the bottom
      plan.receipts!.push({
        date,
        vendor,
        amount,
        description: c.what >= 0 ? str(row[c.what]) || null : null,
        category: c.category >= 0 ? str(row[c.category]) || null : null,
      });
    }
  }

  for (const sheet of sheets) {
    const h = findHeader(sheet, [/quantity purchased|qty purchased|amount purchased/, /price/, /ingredient|item/]);
    if (!h) continue;
    const c = {
      date: col(h.cols, /^date/),
      store: col(h.cols, /store|vendor|where/),
      name: col(h.cols, /ingredient|item/),
      qty: col(h.cols, /quantity|qty|amount/),
      unit: col(h.cols, /base unit/, /^unit$/, /unit/),
      price: col(h.cols, /price|paid|cost/),
    };
    let skipped = 0;
    for (const row of sheet.rows.slice(h.row + 1)) {
      const name = str(row[c.name]);
      if (!name) continue;
      const date = sheetDate(row[c.date] ?? null);
      const unit = normalizeUnit(str(row[c.unit]));
      const quantity = number(row[c.qty]);
      const price = number(row[c.price]);
      if (!date || !unit || !(quantity > 0) || !(price >= 0)) {
        skipped++;
        continue;
      }
      bought.add(nameKey(name));
      plan.purchases.push({ name, date, store: str(row[c.store]) || null, quantity, unit, price });
    }
    if (skipped) plan.notes.push(`${sheet.name}: skipped ${skipped} row${skipped === 1 ? "" : "s"} missing a date, unit, amount or price.`);
  }

  for (const sheet of sheets) {
    const h = findHeader(sheet, [/ingredient|item/, /cost per unit|weighted cost/]);
    if (!h) continue;
    const c = { name: col(h.cols, /ingredient|item/), unit: col(h.cols, /base unit/, /unit/), cost: col(h.cols, /cost per unit|weighted cost/) };
    for (const row of sheet.rows.slice(h.row + 1)) {
      const name = str(row[c.name]);
      if (!name) continue;
      const base = baseUnitFor(normalizeUnit(str(row[c.unit])) ?? "g");
      const cost = number(row[c.cost]);
      if (isOverhead(name, "")) {
        if (cost >= 0) plan.overheadRate = cost;
        continue;
      }
      // Items with no purchases keep the cost the sheet had for them
      const manualCost = !bought.has(nameKey(name)) && cost > 0 ? cost : null;
      plan.ingredients.push({ name, baseUnit: base, manualCost });
    }
  }

  for (const sheet of sheets) {
    const h = findHeader(sheet, [/item name|ingredient/, /quantity used|qty used|amount/]);
    if (!h) continue;
    if (/^recipe costing$|template/i.test(sheet.name.trim())) {
      plan.notes.push(`Skipped "${sheet.name}" (looks like the blank template).`);
      continue;
    }
    const c = { name: col(h.cols, /item name|ingredient/), qty: col(h.cols, /quantity|qty|amount/), unit: col(h.cols, /^unit/) };
    const recipe: ImportRecipe = {
      name: sheet.name.trim(),
      yieldCount: 1,
      yieldLabel: "batch",
      overheadHours: 0,
      sellPrice: null,
      sellPer: "batch",
      source: "sheet",
      lines: [],
    };
    let inLines = true;
    let skipped = 0;
    for (let r = h.row + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r];
      const name = str(row[c.name]);
      // "Cost Per Loaf (÷ 16):" → makes 16 loaves (the label's number, which is what's meant)
      const per = name.match(/cost per ([a-z ]+?)\s*\(\D*(\d+(?:\.\d+)?)\s*\)/i);
      if (per) {
        recipe.yieldCount = Number(per[2]);
        recipe.yieldLabel = plural(per[1].trim(), recipe.yieldCount);
        continue;
      }
      if (/^bundle name/i.test(name)) {
        const next = sheet.rows[r + 1] ?? [];
        const header = row.map((x) => str(x).toLowerCase());
        const priceCol = header.findIndex((x) => /retail|price/.test(x) && !/cost|production/.test(x));
        const price = number(next[priceCol >= 0 ? priceCol : 2]);
        if (price > 0) recipe.sellPrice = price;
        if (str(next[0]) && str(next[0]).toLowerCase() !== recipe.name.toLowerCase()) recipe.notes = `Sold as: ${str(next[0])}`;
        break;
      }
      if (/^total/i.test(name)) inLines = false;
      if (!inLines || !name) continue;
      const rawUnit = str(row[c.unit]);
      const quantity = number(row[c.qty]);
      if (!(quantity > 0)) continue;
      if (isOverhead(name, rawUnit)) {
        recipe.overheadHours += quantity;
        continue;
      }
      const unit = normalizeUnit(rawUnit);
      if (!unit) {
        skipped++;
        continue;
      }
      recipe.lines.push({ ingredientName: name, quantity, unit });
    }
    if (skipped) plan.notes.push(`${sheet.name}: skipped ${skipped} line${skipped === 1 ? "" : "s"} with a unit it didn't recognize.`);
    if (recipe.lines.length) plan.recipes.push(recipe);
  }
  return plan;
}

// ── Mealie ────────────────────────────────────────────────────────────────

const FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875 };

/** "1 1/2", "1½", "0.5", "3/4" → number */
export function parseAmount(s: string): number {
  let total = 0;
  let found = false;
  for (const part of s.replace(/([0-9])([½¼¾⅓⅔⅛⅜⅝⅞])/g, "$1 $2").trim().split(/\s+/)) {
    if (FRACTIONS[part] !== undefined) total += FRACTIONS[part];
    else if (/^\d+\/\d+$/.test(part)) {
      const [a, b] = part.split("/").map(Number);
      if (b) total += a / b;
    } else if (/^\d*\.?\d+$/.test(part)) total += Number(part);
    else continue;
    found = true;
  }
  return found ? total : NaN;
}

/** "1 1/2 cups bread flour, sifted" → { quantity 1.5, unit cup, name "bread flour", note "sifted" } */
export function parseIngredientText(text: string): { quantity: number; unit: string; name: string; note: string | null } {
  const m = text.trim().match(/^([\d\s./½¼¾⅓⅔⅛⅜⅝⅞]+)?\s*(.*)$/);
  let quantity = m?.[1] ? parseAmount(m[1]) : NaN;
  let rest = (m?.[2] ?? text).trim();
  let unit = "pc";
  const word = rest.match(/^([a-zA-Z.]+(?: oz)?)\s+(.*)$/);
  if (word && normalizeUnit(word[1].replace(/^fl$/i, "fl oz"))) {
    unit = normalizeUnit(word[1])!;
    rest = word[2];
  }
  if (!(quantity > 0)) quantity = 1;
  const [name, ...noteParts] = rest.replace(/\([^)]*\)/g, "").split(",");
  return { quantity, unit, name: name.trim(), note: noteParts.join(",").trim() || null };
}

type MealieIngredient = {
  quantity?: number | null;
  unit?: { name?: string; abbreviation?: string } | string | null;
  food?: { name?: string } | string | null;
  note?: string | null;
  display?: string | null;
  originalText?: string | null;
  title?: string | null;
};
type MealieRecipe = {
  name?: string;
  recipeYield?: string | null;
  recipeYieldQuantity?: number | null;
  recipeServings?: number | null;
  recipeIngredient?: MealieIngredient[];
  description?: string | null;
};

/** Mealie's API uses camelCase, its recipe download snake_case: read both. */
const camel = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), v]));

function recipesIn(json: unknown): MealieRecipe[] {
  if (Array.isArray(json)) return json.flatMap(recipesIn);
  if (json && typeof json === "object") {
    const o = camel(json as Record<string, unknown>);
    if (Array.isArray(o.recipeIngredient) && o.name) {
      return [{ ...o, recipeIngredient: (o.recipeIngredient as Record<string, unknown>[]).map((i) => camel(i ?? {})) } as MealieRecipe];
    }
    for (const k of ["items", "recipes", "data"]) if (Array.isArray(o[k])) return recipesIn(o[k]);
  }
  return [];
}

/** Recipes from Mealie's JSON (one recipe, a list, or a Mealie export's recipe files). */
export function planFromMealie(jsons: unknown[]): ImportPlan {
  const plan: ImportPlan = { ingredients: [], purchases: [], recipes: [], notes: [] };
  for (const r of jsons.flatMap(recipesIn)) {
    const yieldText = str(r.recipeYield);
    // A yield written out ("24 cookies") wins; Mealie's bare "1" with servings set means it makes that many
    const textCount = parseAmount(yieldText);
    const yieldCount =
      textCount > 0
        ? textCount
        : Number(r.recipeYieldQuantity) > 1
          ? Number(r.recipeYieldQuantity)
          : Number(r.recipeServings) > 0
            ? Number(r.recipeServings)
            : 1;
    const yieldLabel = yieldText.replace(/^[\d\s./½¼¾⅓⅔⅛-]+/, "").trim() || (Number(r.recipeServings) > 0 ? "servings" : "items");
    const lines: ImportLine[] = [];
    for (const i of r.recipeIngredient ?? []) {
      if (i.title && !i.food && !i.note && !i.display) continue; // section headings
      const food = typeof i.food === "string" ? i.food : i.food?.name;
      const unitName = typeof i.unit === "string" ? i.unit : i.unit?.name || i.unit?.abbreviation;
      if (food) {
        if (!(Number(i.quantity) > 0)) {
          plan.notes.push(`${r.name}: "${food}" has no amount (e.g. "to taste"), so it's left out.`);
          continue;
        }
        const unit = normalizeUnit(unitName) ?? (unitName ? null : "pc");
        if (!unit) {
          plan.notes.push(`${r.name}: "${unitName}" isn't a unit I know, so ${food} is counted in pieces (1 ${unitName} = 1 piece).`);
        }
        lines.push({ ingredientName: food, quantity: Number(i.quantity), unit: unit ?? "pc", note: str(i.note) || null });
      } else {
        // Mealie didn't parse this line into amount / unit / food: read the text
        const text = str(i.originalText) || str(i.display) || str(i.note);
        if (!text) continue;
        const p = parseIngredientText(text);
        if (p.name) lines.push({ ingredientName: p.name, quantity: p.quantity, unit: p.unit, note: p.note });
      }
    }
    plan.recipes.push({
      name: str(r.name) || "Untitled recipe",
      yieldCount,
      yieldLabel,
      overheadHours: 0,
      sellPrice: null,
      sellPer: "batch",
      notes: str(r.description) || null,
      source: "mealie",
      lines,
    });
  }
  return plan;
}
