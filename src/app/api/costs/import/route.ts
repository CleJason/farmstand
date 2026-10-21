import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { loadCosts } from "@/lib/costs-data";
import { baseUnitFor, guessBaseUnit, nameKey, normalizeUnit, suggestGramsPerCup, toBase, type BaseUnit } from "@/lib/costs";

type InIngredient = { name: string; baseUnit?: string; gramsPerCup?: number | null; manualCost?: number | null };
type InPurchase = { name: string; date: string; store?: string | null; quantity: number; unit: string; price: number };
type InLine = { ingredientId?: string; ingredientName?: string; quantity: number; unit: string; note?: string | null };
type InRecipe = {
  name: string;
  yieldCount?: number;
  yieldLabel?: string;
  overheadHours?: number;
  sellPrice?: number | null; // dollars
  sellPer?: string;
  notes?: string | null;
  source?: string;
  lines: InLine[];
};

const clean = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : NaN);

/**
 * Bring in a spreadsheet or Mealie recipes (parsed in the browser): `ingredients`,
 * `purchases`, `recipes`, optional `overheadRate`. Names match existing
 * ingredients loosely ("Whole Milk " = "whole milk"); anything new is added.
 * Purchases already in the log (same item, day, store, amount, price) are
 * skipped, so importing the same file again is safe. A recipe with the same
 * name is replaced only when `replace` is true.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const inIngredients: InIngredient[] = Array.isArray(data.ingredients) ? data.ingredients.slice(0, 2000) : [];
  const inPurchases: InPurchase[] = Array.isArray(data.purchases) ? data.purchases.slice(0, 10000) : [];
  const inRecipes: InRecipe[] = Array.isArray(data.recipes) ? data.recipes.slice(0, 500) : [];
  const replace = data.replace === true;
  const counts = {
    ingredients: 0,
    purchases: 0,
    duplicatePurchases: 0,
    skippedPurchases: [] as string[],
    receipts: 0,
    duplicateReceipts: 0,
    recipes: 0,
    replacedRecipes: 0,
    skippedRecipes: 0,
    skippedLines: 0,
  };

  const existing = await prisma.ingredient.findMany();
  const byKey = new Map(existing.map((i) => [nameKey(i.name), i]));
  const byId = new Map(existing.map((i) => [i.id, i]));
  const ensure = async (rawName: string, base: BaseUnit, extra: Partial<InIngredient> = {}) => {
    const name = clean(rawName);
    if (!name) return null;
    const found = byKey.get(nameKey(name));
    if (found) {
      // Fill in what an import knows and the ingredient doesn't yet
      const fill: Record<string, number> = {};
      if (found.manualCost == null && extra.manualCost != null && extra.manualCost >= 0) fill.manualCost = extra.manualCost;
      if (found.gramsPerCup == null && extra.gramsPerCup && extra.gramsPerCup > 0) fill.gramsPerCup = extra.gramsPerCup;
      if (Object.keys(fill).length) Object.assign(found, await prisma.ingredient.update({ where: { id: found.id }, data: fill }));
      return found;
    }
    const created = await prisma.ingredient.create({
      data: {
        name,
        baseUnit: base,
        gramsPerCup: base === "pc" ? null : extra.gramsPerCup && extra.gramsPerCup > 0 ? extra.gramsPerCup : suggestGramsPerCup(name),
        manualCost: extra.manualCost != null && extra.manualCost >= 0 ? extra.manualCost : null,
      },
    });
    byKey.set(nameKey(name), created);
    byId.set(created.id, created);
    counts.ingredients++;
    return created;
  };

  // Ingredients first (from the inventory list), then the purchase log
  for (const i of inIngredients) {
    const base = (["g", "ml", "pc"].includes(String(i.baseUnit)) ? i.baseUnit : "g") as BaseUnit;
    await ensure(i.name, base, i);
  }

  const seen = new Set(
    (await prisma.ingredientPurchase.findMany()).map(
      (p) => `${p.ingredientId}|${p.date.toISOString().slice(0, 10)}|${(p.store ?? "").toLowerCase()}|${p.quantity.toFixed(2)}|${p.price}`
    )
  );
  const newPurchases = [];
  for (const p of inPurchases) {
    const u = normalizeUnit(p.unit);
    const date = new Date(p.date);
    const qty = num(p.quantity);
    const price = Math.round(num(p.price) * 100);
    if (!u || Number.isNaN(date.getTime()) || !(qty > 0) || !(price >= 0)) continue;
    const ing = await ensure(p.name, baseUnitFor(u));
    if (!ing) continue;
    const base = toBase(qty, u, ing);
    if (base.error) {
      counts.skippedPurchases.push(`${clean(p.name)} (${qty} ${u}, but it's tracked in ${ing.baseUnit})`);
      continue;
    }
    const store = clean(p.store).slice(0, 60) || null;
    const key = `${ing.id}|${date.toISOString().slice(0, 10)}|${(store ?? "").toLowerCase()}|${base.amount.toFixed(2)}|${price}`;
    if (seen.has(key)) {
      counts.duplicatePurchases++;
      continue;
    }
    seen.add(key);
    newPurchases.push({ ingredientId: ing.id, date, store, quantity: base.amount, price });
  }
  if (newPurchases.length) await prisma.ingredientPurchase.createMany({ data: newPurchases });
  counts.purchases = newPurchases.length;

  // Receipts (the expense log); the same date + store + total already here is skipped
  const inReceipts: { date: string; vendor: string; amount: number; description?: string | null; category?: string | null }[] =
    Array.isArray(data.receipts) ? data.receipts.slice(0, 10000) : [];
  if (inReceipts.length) {
    const have = new Set(
      (await prisma.receipt.findMany()).map((r) => `${r.date.toISOString().slice(0, 10)}|${r.vendor.toLowerCase()}|${r.amount}`)
    );
    const fresh = [];
    for (const r of inReceipts) {
      const date = new Date(r.date);
      const vendor = clean(r.vendor).slice(0, 60);
      const amount = Math.round(num(r.amount) * 100);
      if (Number.isNaN(date.getTime()) || !vendor || !(amount >= 0)) continue;
      const key = `${date.toISOString().slice(0, 10)}|${vendor.toLowerCase()}|${amount}`;
      if (have.has(key)) {
        counts.duplicateReceipts++;
        continue;
      }
      have.add(key);
      fresh.push({
        date,
        vendor,
        amount,
        description: String(r.description ?? "").trim().slice(0, 1000) || null,
        category: clean(r.category).slice(0, 40) || null,
      });
    }
    if (fresh.length) await prisma.receipt.createMany({ data: fresh });
    counts.receipts = fresh.length;
  }

  if (data.overheadRate !== undefined && Number.isFinite(Number(data.overheadRate)) && Number(data.overheadRate) >= 0) {
    const value = String(Number(data.overheadRate));
    await prisma.setting.upsert({ where: { key: "COST_OVERHEAD_RATE" }, update: { value }, create: { key: "COST_OVERHEAD_RATE", value } });
  }

  const recipes = await prisma.recipe.findMany({ select: { id: true, name: true } });
  for (const r of inRecipes) {
    const name = clean(r.name);
    if (!name) continue;
    const same = recipes.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (same && !replace) {
      counts.skippedRecipes++;
      continue;
    }
    const lines = [];
    for (const l of Array.isArray(r.lines) ? r.lines.slice(0, 200) : []) {
      const u = normalizeUnit(l.unit) ?? "pc";
      const qty = num(l.quantity);
      const ing =
        l.ingredientId && byId.get(l.ingredientId)
          ? byId.get(l.ingredientId)!
          : await ensure(String(l.ingredientName ?? ""), guessBaseUnit(String(l.ingredientName ?? ""), u));
      if (!ing || !(qty > 0)) {
        counts.skippedLines++;
        continue;
      }
      lines.push({ ingredientId: ing.id, quantity: qty, unit: u, note: clean(l.note).slice(0, 200) || null, position: lines.length });
    }
    const fields = {
      name,
      yieldCount: num(r.yieldCount) > 0 ? num(r.yieldCount) : 1,
      yieldLabel: clean(r.yieldLabel).slice(0, 40) || "items",
      overheadHours: num(r.overheadHours) >= 0 ? num(r.overheadHours) : 0,
      sellPrice: num(r.sellPrice) >= 0 ? Math.round(num(r.sellPrice) * 100) : null,
      sellPer: r.sellPer === "item" ? "item" : "batch",
      notes: String(r.notes ?? "").trim().slice(0, 4000) || null,
      source: r.source === "mealie" ? "mealie" : "sheet",
    };
    if (same) {
      await prisma.$transaction([
        prisma.recipeLine.deleteMany({ where: { recipeId: same.id } }),
        prisma.recipe.update({ where: { id: same.id }, data: { ...fields, lines: { create: lines } } }),
      ]);
      counts.replacedRecipes++;
    } else {
      const created = await prisma.recipe.create({ data: { ...fields, lines: { create: lines } } });
      recipes.push({ id: created.id, name: created.name });
      counts.recipes++;
    }
  }

  return NextResponse.json({ counts, data: await loadCosts() });
}
