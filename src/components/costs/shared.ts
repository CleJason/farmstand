import type { CostsData } from "@/lib/costs-data";
import { money } from "@/lib/costs";

/** Send a change to the Costs API; `data` is the fresh Costs data, `json` the whole reply. */
export type Save = (
  url: string,
  method: string,
  body?: unknown
) => Promise<{ error: string; data: CostsData | null; json: Record<string, unknown> }>;
export type TabProps = { data: CostsData; save: Save };
export type IngredientRow = CostsData["ingredients"][number];
export type RecipeRow = CostsData["recipes"][number];

/** Inputs: `inputClass` plus a width (w-20…), or `fieldClass` to fill the space */
export const inputClass =
  "text-sm px-2.5 py-1.5 border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500";
export const fieldClass = `${inputClass} w-full`;
export const buttonClass =
  "bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2 rounded-lg";
export const ghostClass =
  "bg-white hover:bg-stone-50 disabled:opacity-50 text-stone-700 border border-stone-300 font-semibold text-sm px-4 py-2 rounded-lg";

/** A base-unit cost in the units people think in: per lb, per fl oz, or each. */
export function unitPrice(cost: number | null, baseUnit: string): string {
  if (cost === null) return "no price";
  if (baseUnit === "g") return `${money(cost * 453.59)}/lb`;
  if (baseUnit === "ml") return `${money(cost * 29.57)}/fl oz`;
  return `${money(cost, cost < 1 ? 3 : 2)} each`;
}

/** A base-unit amount readable: 5440 g → "5.44 kg (12.0 lb)". */
export function amount(n: number, baseUnit: string): string {
  if (baseUnit === "g") return n >= 1000 ? `${(n / 1000).toFixed(2)} kg (${(n / 453.59).toFixed(1)} lb)` : `${Math.round(n)} g`;
  if (baseUnit === "ml") return n >= 1000 ? `${(n / 1000).toFixed(2)} L` : `${Math.round(n)} ml`;
  return `${Math.round(n * 100) / 100} pc`;
}

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
