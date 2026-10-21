/**
 * Ingredient and recipe costing (Admin → Costs). Pure math, used by the API
 * and the admin page alike. Everything is tracked per base unit: grams (g),
 * milliliters (ml) or pieces (pc). Recipes can say cups, tbsp, oz…: a weighed
 * ingredient needs its grams-per-cup to price cups and spoons correctly.
 */

export type BaseUnit = "g" | "ml" | "pc";

// A stick of butter is 4 oz
const WEIGHT: Record<string, number> = { g: 1, kg: 1000, oz: 28.35, lb: 453.59, stick: 113.4 };
const VOLUME: Record<string, number> = {
  ml: 1,
  l: 1000,
  pinch: 0.31, // 1/16 tsp
  dash: 0.62, // 1/8 tsp
  tsp: 4.93,
  tbsp: 14.79,
  "fl oz": 29.57,
  cup: 236.59,
  pt: 473.18,
  qt: 946.35,
  gal: 3785.41,
};
const COUNT: Record<string, number> = { pc: 1, dozen: 12 };
const ML_PER_CUP = 236.59;

/** Units offered in the forms, grouped. */
export const UNITS = {
  weight: Object.keys(WEIGHT),
  volume: Object.keys(VOLUME),
  count: Object.keys(COUNT),
};

/** "Cups", "T", "tablespoons", "Pieces", "#"… → our unit names, or null if unknown. */
export function normalizeUnit(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim().replace(/\.$/, "");
  // Recipe shorthand: capital T is a tablespoon, small t a teaspoon
  if (raw === "T" || raw === "Tbsp" || raw === "TBSP") return "tbsp";
  if (raw === "t") return "tsp";
  const u = raw.toLowerCase();
  if (!u) return null;
  if (u === "tbs" || u === "tbl" || u.startsWith("tablespoon") || u === "tbsp") return "tbsp";
  if (u === "tsp" || u.startsWith("teaspoon") || u === "ts") return "tsp";
  if (u === "c" || u.startsWith("cup")) return "cup";
  if (u === "g" || u.startsWith("gram") || u === "gr") return "g";
  if (u === "kg" || u.startsWith("kilo")) return "kg";
  if (u === "oz" || u.startsWith("ounce")) return "oz";
  if (u === "lb" || u === "lbs" || u === "#" || u.startsWith("pound")) return "lb";
  if (u === "ml" || u.startsWith("millil")) return "ml";
  if (u === "l" || u.startsWith("liter") || u.startsWith("litre")) return "l";
  if (u === "fl oz" || u === "floz" || u.startsWith("fluid")) return "fl oz";
  if (u === "pt" || u.startsWith("pint")) return "pt";
  if (u === "qt" || u.startsWith("quart")) return "qt";
  if (u === "gal" || u.startsWith("gallon")) return "gal";
  if (u === "dozen" || u === "doz") return "dozen";
  if (u.startsWith("pinch")) return "pinch";
  if (u.startsWith("dash")) return "dash";
  if (u.startsWith("stick")) return "stick";
  const counted = ["pc", "pcs", "piece", "pieces", "each", "ea", "count", "ct", "whole", "large", "egg", "eggs", "clove", "cloves"];
  if (counted.includes(u)) return "pc";
  return null;
}

/**
 * How a new ingredient from a recipe line is tracked: counted if the recipe
 * counts it, by volume for liquids, otherwise by weight (even when the recipe
 * says cups: flour and sugar are bought by weight).
 */
export function guessBaseUnit(name: string, unit: string): BaseUnit {
  const u = normalizeUnit(unit) ?? unit;
  if (u in COUNT) return "pc";
  if (/milk(?! powder)|cream(?! cheese)|water|oil|extract|juice|vinegar|liqueur|bourbon|rum|coffee/i.test(name) && !/dry milk|powder/i.test(name)) {
    return "ml";
  }
  return "g";
}

export function baseUnitFor(unit: string): BaseUnit {
  if (unit in VOLUME) return "ml";
  if (unit in COUNT) return "pc";
  return "g";
}

/**
 * An amount in an ingredient's base unit. `estimated` = cups for a weighed
 * ingredient (or grams for a liquid) with no grams-per-cup set, so 1 ml is
 * taken as 1 g (that's off for flour and sugar). `error` = can't convert
 * (e.g. grams of something counted in pieces).
 */
export function toBase(
  quantity: number,
  unit: string,
  ingredient: { baseUnit: string; gramsPerCup?: number | null }
): { amount: number; estimated?: boolean; error?: string } {
  const u = normalizeUnit(unit) ?? unit;
  const gpc = ingredient.gramsPerCup && ingredient.gramsPerCup > 0 ? ingredient.gramsPerCup : null;
  const gPerMl = gpc ? gpc / ML_PER_CUP : 1;
  if (ingredient.baseUnit === "pc") {
    if (u in COUNT) return { amount: quantity * COUNT[u] };
    return { amount: 0, error: `${unit} of something counted in pieces` };
  }
  if (u in COUNT) return { amount: 0, error: "pieces of something weighed or measured" };
  if (ingredient.baseUnit === "ml") {
    if (u in VOLUME) return { amount: quantity * VOLUME[u] };
    if (u in WEIGHT) return { amount: (quantity * WEIGHT[u]) / gPerMl, estimated: !gpc };
  } else {
    if (u in WEIGHT) return { amount: quantity * WEIGHT[u] };
    if (u in VOLUME) return { amount: quantity * VOLUME[u] * gPerMl, estimated: !gpc };
  }
  return { amount: 0, error: `unknown unit "${unit}"` };
}

export type PurchaseRow = { quantity: number; price: number; date: string | Date };

/**
 * What one base unit costs: total spent ÷ total bought (like the "weighted cost
 * per unit" in the spreadsheet), plus the most recent purchase's price.
 */
export function unitCosts(purchases: PurchaseRow[], manualCost?: number | null) {
  const bought = purchases.reduce((n, p) => n + p.quantity, 0);
  const spent = purchases.reduce((n, p) => n + p.price, 0) / 100;
  const latest = [...purchases].sort((a, b) => +new Date(b.date) - +new Date(a.date))[0];
  return {
    bought,
    spent,
    average: bought > 0 ? spent / bought : manualCost ?? null,
    latest: latest && latest.quantity > 0 ? latest.price / 100 / latest.quantity : manualCost ?? null,
  };
}

export type CostIngredient = {
  id: string;
  name: string;
  baseUnit: string;
  gramsPerCup?: number | null;
  cost: number | null; // $ per base unit (average or latest)
};

export type CostRecipe = {
  yieldCount: number;
  overheadHours: number;
  sellPrice?: number | null; // cents
  sellPer: string;
  lines: { ingredientId: string; quantity: number; unit: string }[];
};

/** A recipe's costs: each line, ingredients total, overhead, batch total, per item, profit. */
export function costRecipe(recipe: CostRecipe, ingredients: Map<string, CostIngredient>, overheadRate: number) {
  const lines = recipe.lines.map((l) => {
    const ing = ingredients.get(l.ingredientId);
    if (!ing) return { cost: 0, problem: "missing ingredient" };
    const base = toBase(l.quantity, l.unit, ing);
    if (base.error) return { cost: 0, problem: base.error };
    if (ing.cost === null) return { cost: 0, amount: base.amount, problem: "no price yet" };
    return { cost: base.amount * ing.cost, amount: base.amount, estimated: base.estimated };
  });
  const ingredientsCost = lines.reduce((n, l) => n + l.cost, 0);
  const overhead = recipe.overheadHours * overheadRate;
  const batch = ingredientsCost + overhead;
  const count = recipe.yieldCount > 0 ? recipe.yieldCount : 1;
  const perItem = batch / count;
  const price = recipe.sellPrice != null ? recipe.sellPrice / 100 : null;
  const batchPrice = price === null ? null : recipe.sellPer === "item" ? price * count : price;
  const profit = batchPrice === null ? null : batchPrice - batch;
  return {
    lines,
    ingredientsCost,
    overhead,
    batch,
    perItem,
    batchPrice,
    profit,
    margin: batchPrice ? (profit! / batchPrice) * 100 : null,
    problems: lines.filter((l) => l.problem).length,
    estimates: lines.filter((l) => "estimated" in l && l.estimated).length,
  };
}

/**
 * Rough weight of 1 cup, so cups and spoons of common baking ingredients price
 * right out of the box. Owners can change any of these per ingredient.
 */
const GRAMS_PER_CUP: [RegExp, number][] = [
  [/powdered|confectioner|icing sugar/i, 120],
  [/brown sugar/i, 213],
  [/sugar/i, 200],
  [/almond flour/i, 96],
  [/flour/i, 120],
  [/cocoa/i, 85],
  [/cornstarch|corn starch/i, 112],
  [/quick oats|rolled oats|oats/i, 90],
  [/cinnamon|nutmeg|clove|ginger|allspice|spice/i, 110],
  [/peanut butter|biscoff|cookie butter|nutella|spread/i, 270],
  [/butter(?! ?milk)/i, 227],
  [/cream cheese/i, 232],
  [/yogurt|sour cream/i, 245],
  [/pumpkin/i, 245],
  [/honey|molasses|syrup/i, 340],
  [/marshmallow fluff|marshmallow creme/i, 128],
  [/morsel|chocolate chip|chips/i, 170],
  [/sea salt|kosher salt|salt/i, 288],
  [/baking soda/i, 220],
  [/baking powder/i, 192],
  [/yeast/i, 150],
  [/dry milk|milk powder|powdered milk/i, 68],
  [/milk|cream|water|oil|extract|vanilla/i, 236],
];

export function suggestGramsPerCup(name: string): number | null {
  const hit = GRAMS_PER_CUP.find(([re]) => re.test(name));
  return hit ? hit[1] : null;
}

/** Ingredient names compared loosely: case, extra spaces and trailing "s" don't matter. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ").replace(/(?<=\w)s$/, "");
}

export const money = (n: number | null | undefined, digits = 2) =>
  n == null || !Number.isFinite(n) ? "—" : `$${n.toFixed(digits)}`;
