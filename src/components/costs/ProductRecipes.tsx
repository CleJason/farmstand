"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/costs";
import type { CostsData } from "@/lib/costs-data";

export type RecipeTag = { recipeId: string; amount: string };

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/** The costs data the product editor needs (recipes and current tags), fresh each time it opens. */
export function useCostsData(open: boolean) {
  const [data, setData] = useState<CostsData | null>(null);
  useEffect(() => {
    if (!open) return;
    fetch("/api/costs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, [open]);
  return data;
}

/** A product's current recipe tags, for the editor's starting state. */
export function tagsFor(data: CostsData | null, name: string): RecipeTag[] {
  const p = data?.products.find((x) => x.key === key(name));
  return p ? p.links.map((l) => ({ recipeId: l.recipeId, amount: String(l.itemsPerUnit) })) : [];
}

/** Save a product's recipe tags (and clear them from its old name after a rename). */
export async function saveTags(name: string, tags: RecipeTag[], oldName?: string | null) {
  const put = (n: string, links: { recipeId: string; itemsPerUnit: string }[]) =>
    fetch("/api/costs/links", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n, links }) });
  if (oldName && key(oldName) !== key(name)) await put(oldName, []);
  await put(
    name,
    tags.filter((t) => t.recipeId && Number(t.amount) > 0).map((t) => ({ recipeId: t.recipeId, itemsPerUnit: t.amount }))
  );
}

/**
 * Product editor → "Recipes used": which recipes go into one of this product
 * and how much of each, in the recipe's own units (4 of an 8-roll Cinnamon
 * Rolls recipe, 4 rolls' worth of Frosting). Gives its cost to make.
 */
export default function ProductRecipes({
  data,
  tags,
  onChange,
  priceDollars,
}: {
  data: CostsData | null;
  tags: RecipeTag[];
  onChange: (tags: RecipeTag[]) => void;
  priceDollars: string;
}) {
  if (!data) return <p className="text-xs text-stone-400">Loading recipes…</p>;
  const recipe = (id: string) => data.recipes.find((r) => r.id === id);
  const cost = tags.reduce((s, t) => s + (recipe(t.recipeId)?.cost.perItem ?? 0) * (Number(t.amount) || 0), 0);
  const price = Number(priceDollars) || 0;
  const field = "text-sm px-2.5 py-1.5 border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30";

  return (
    <div className="space-y-2">
      {!data.recipes.length && <p className="text-xs text-stone-500">Add recipes in Admin → Costs first.</p>}
      {tags.map((t, i) => {
        const r = recipe(t.recipeId);
        return (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <input
              type="number"
              min={0}
              step="any"
              value={t.amount}
              onChange={(e) => onChange(tags.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
              className={`${field} w-20`}
              aria-label="How much"
            />
            <span className="text-stone-600">{r?.yieldLabel ?? ""} from</span>
            <select
              value={t.recipeId}
              onChange={(e) => onChange(tags.map((x, j) => (j === i ? { ...x, recipeId: e.target.value } : x)))}
              className={`${field} flex-1 min-w-40`}
            >
              <option value="">Pick a recipe…</option>
              {data.recipes.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} (makes {x.yieldCount} {x.yieldLabel})
                </option>
              ))}
            </select>
            {r && <span className="text-xs text-stone-500 w-14 text-right">{money(r.cost.perItem * (Number(t.amount) || 0))}</span>}
            <button type="button" onClick={() => onChange(tags.filter((_, j) => j !== i))} className="px-1 text-stone-400 hover:text-red-600" aria-label="Remove recipe">
              ×
            </button>
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...tags, { recipeId: "", amount: "1" }])} className="text-xs font-semibold text-amber-700 hover:underline">
        + Add a recipe
      </button>
      {tags.length > 0 && (
        <p className="text-xs text-stone-600">
          Cost to make one: <b>{money(cost)}</b>
          {price > 0 && cost > 0 && (
            <>
              {" "}
              · profit {money(price - cost)} ({Math.round(((price - cost) / price) * 100)}%)
            </>
          )}
        </p>
      )}
    </div>
  );
}
