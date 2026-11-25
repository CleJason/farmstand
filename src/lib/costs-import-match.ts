import { nameKey } from "@/lib/costs";

/** Shared by the Costs import page and the app's import (via /api/costs/import/plan). */

export type Counts = {
  ingredients: number;
  purchases: number;
  duplicatePurchases: number;
  skippedPurchases: string[];
  receipts?: number;
  duplicateReceipts?: number;
  pastSales?: number;
  duplicatePastSales?: number;
  recipes: number;
  replacedRecipes: number;
  skippedRecipes: number;
  skippedLines: number;
};

export const summary = (c: Counts) =>
  [
    c.purchases && `${c.purchases} purchases`,
    c.duplicatePurchases && `${c.duplicatePurchases} purchases already in the log (skipped)`,
    c.pastSales && `${c.pastSales} past sales`,
    c.duplicatePastSales && `${c.duplicatePastSales} past sales already here (skipped)`,
    c.receipts && `${c.receipts} receipts`,
    c.duplicateReceipts && `${c.duplicateReceipts} receipts already here (skipped)`,
    c.ingredients && `${c.ingredients} new ingredients`,
    c.recipes && `${c.recipes} new recipes`,
    c.replacedRecipes && `${c.replacedRecipes} recipes updated`,
    c.skippedRecipes && `${c.skippedRecipes} recipes already here (kept as they were)`,
    c.skippedLines && `${c.skippedLines} recipe lines skipped`,
    c.skippedPurchases?.length && `skipped (unit doesn't fit the item): ${c.skippedPurchases.join("; ")}`,
  ]
    .filter(Boolean)
    .join(" · ") || "Nothing new to import.";

/** Plain names recipes use for something more specific on the shopping list */
const SAME_AS: Record<string, string> = {
  sugar: "granulated sugar",
  "white sugar": "granulated sugar",
  "brown sugar": "light brown sugar",
  "confectioners sugar": "powdered sugar",
  "vanilla": "vanilla extract",
  milk: "whole milk",
};

/** Best existing ingredient for a recipe's ingredient name, or "" for "add it as new". */
export function match(name: string, ingredients: { id: string; name: string }[]): string {
  const key = nameKey(name);
  const want = [key, SAME_AS[key] && nameKey(SAME_AS[key])].filter(Boolean);
  const exact = ingredients.find((i) => want.includes(nameKey(i.name)));
  if (exact) return exact.id;
  // Otherwise the closest name that contains it, or that it contains ("unsalted butter" ↔ "Unsalted Butter (Costco)")
  const close = ingredients
    .filter((i) => {
      const k = nameKey(i.name);
      return k.length > 2 && (key.includes(k) || k.includes(key));
    })
    .sort((a, b) => Math.abs(a.name.length - key.length) - Math.abs(b.name.length - key.length))[0];
  return close?.id ?? "";
}

