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
export type ImportPlan = {
  ingredients: ImportIngredient[];
  purchases: ImportPurchase[];
  recipes: ImportRecipe[];
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
  const plan: ImportPlan = { ingredients: [], purchases: [], recipes: [], notes: [] };
  const bought = new Set<string>();

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

function recipesIn(json: unknown): MealieRecipe[] {
  if (Array.isArray(json)) return json.flatMap(recipesIn);
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    if (Array.isArray(o.recipeIngredient) && o.name) return [o as MealieRecipe];
    for (const k of ["items", "recipes", "data"]) if (Array.isArray(o[k])) return recipesIn(o[k]);
  }
  return [];
}

/** Recipes from Mealie's JSON (one recipe, a list, or a Mealie export's recipe files). */
export function planFromMealie(jsons: unknown[]): ImportPlan {
  const plan: ImportPlan = { ingredients: [], purchases: [], recipes: [], notes: [] };
  for (const r of jsons.flatMap(recipesIn)) {
    const yieldText = str(r.recipeYield);
    const yieldCount = Number(r.recipeYieldQuantity) > 0 ? Number(r.recipeYieldQuantity) : parseAmount(yieldText) > 0 ? parseAmount(yieldText) : Number(r.recipeServings) > 0 ? Number(r.recipeServings) : 1;
    const yieldLabel = yieldText.replace(/^[\d\s./½¼¾⅓⅔⅛-]+/, "").trim() || (r.recipeServings ? "servings" : "items");
    const lines: ImportLine[] = [];
    for (const i of r.recipeIngredient ?? []) {
      if (i.title && !i.food && !i.note && !i.display) continue; // section headings
      const food = typeof i.food === "string" ? i.food : i.food?.name;
      const unitName = typeof i.unit === "string" ? i.unit : i.unit?.name || i.unit?.abbreviation;
      if (food) {
        const unit = normalizeUnit(unitName) ?? (unitName ? null : "pc");
        if (!unit) {
          plan.notes.push(`${r.name}: "${unitName}" isn't a unit I know, so "${food}" is counted as pieces. Change it after importing if needed.`);
        }
        lines.push({ ingredientName: food, quantity: Number(i.quantity) > 0 ? Number(i.quantity) : 1, unit: unit ?? "pc", note: str(i.note) || null });
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
