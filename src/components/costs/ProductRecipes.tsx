"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/costs";
import type { CostsData } from "@/lib/costs-data";

/** One tag in the editor: `ref` is "r:<recipe id>" or "i:<ingredient id>" (packaging etc.), "" until picked. */
export type RecipeTag = { ref: string; amount: string };

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
type Link = { recipeId: string | null; ingredientId?: string | null; itemsPerUnit: number };

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

export const linkRef = (l: Link) => (l.ingredientId ? `i:${l.ingredientId}` : `r:${l.recipeId}`);

/** A product's current tags, for the editor's starting state. */
export function tagsFor(data: CostsData | null, name: string): RecipeTag[] {
  return (data?.tags[key(name)] ?? []).map((l) => ({ ref: linkRef(l), amount: String(l.itemsPerUnit) }));
}

/** A box choice's tags are its own: "<box> › <choice>" (older ones saved under the choice's name still apply, unless that's a product of its own). */
export const choiceName = (box: string, choice: string) => `${box} › ${choice}`;
export function choiceTagsFor(data: CostsData | null, box: string, choice: string): RecipeTag[] {
  const own = tagsFor(data, choiceName(box, choice));
  if (own.length || !data) return own;
  const isProduct = data.products.some((p) => p.key === key(choice) && p.price !== null);
  return isProduct ? [] : tagsFor(data, choice);
}

/** What one of `ref` costs, and the unit its amount is in. */
export function refCost(data: CostsData | null, ref: string): { each: number; unit: string; name: string } | null {
  if (!data || !ref) return null;
  const id = ref.slice(2);
  if (ref.startsWith("i:")) {
    const i = data.ingredients.find((x) => x.id === id);
    return i ? { each: i.cost ?? 0, unit: i.baseUnit === "pc" ? "pc" : i.baseUnit, name: i.name } : null;
  }
  const r = data.recipes.find((x) => x.id === id);
  return r ? { each: r.cost.perItem, unit: r.yieldLabel, name: r.name } : null;
}

/** Total cost of a set of tags (or saved links). */
export function tagsCost(data: CostsData | null, tags: RecipeTag[]) {
  return tags.reduce((s, t) => s + (refCost(data, t.ref)?.each ?? 0) * (Number(t.amount) || 0), 0);
}
export const linksCost = (data: CostsData | null, links: Link[]) =>
  tagsCost(data, links.map((l) => ({ ref: linkRef(l), amount: String(l.itemsPerUnit) })));

/** Save a product's tags (and clear them from its old name after a rename). */
export async function saveTags(name: string, tags: RecipeTag[], oldName?: string | null) {
  const put = (n: string, links: Record<string, string | undefined>[]) =>
    fetch("/api/costs/links", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n, links }) });
  if (oldName && key(oldName) !== key(name)) await put(oldName, []);
  await put(
    name,
    tags
      .filter((t) => t.ref && Number(t.amount) > 0)
      .map((t) => (t.ref.startsWith("i:") ? { ingredientId: t.ref.slice(2), itemsPerUnit: t.amount } : { recipeId: t.ref.slice(2), itemsPerUnit: t.amount }))
  );
}

/**
 * "Recipes used": which recipes, and which packaging or single ingredients,
 * go into one of this product and how much of each: recipes in their own
 * units (4 of an 8-roll Cinnamon Rolls recipe), items in theirs (1 box).
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
  const cost = tagsCost(data, tags);
  const price = Number(priceDollars) || 0;
  const field = "text-sm px-2.5 py-1.5 border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30";
  // Packaging first among the items (counted ones), then the rest
  const items = [...data.ingredients].sort((a, b) => Number(b.baseUnit === "pc") - Number(a.baseUnit === "pc") || a.name.localeCompare(b.name));

  return (
    <div className="space-y-2">
      {tags.map((t, i) => {
        const c = refCost(data, t.ref);
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
            <span className="text-stone-600">{c ? (t.ref.startsWith("i:") ? c.unit : `${c.unit} from`) : ""}</span>
            <select
              value={t.ref}
              onChange={(e) => onChange(tags.map((x, j) => (j === i ? { ...x, ref: e.target.value } : x)))}
              className={`${field} flex-1 min-w-40`}
            >
              <option value="">Pick a recipe or item…</option>
              <optgroup label="Recipes">
                {data.recipes.map((x) => (
                  <option key={x.id} value={`r:${x.id}`}>
                    {x.name} (makes {x.yieldCount} {x.yieldLabel})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Packaging & single items">
                {items.map((x) => (
                  <option key={x.id} value={`i:${x.id}`}>
                    {x.name} ({x.baseUnit === "pc" ? "each" : x.baseUnit})
                  </option>
                ))}
              </optgroup>
            </select>
            {c && <span className="text-xs text-stone-500 w-14 text-right">{money(c.each * (Number(t.amount) || 0))}</span>}
            <button type="button" onClick={() => onChange(tags.filter((_, j) => j !== i))} className="px-1 text-stone-400 hover:text-red-600" aria-label="Remove">
              ×
            </button>
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...tags, { ref: "", amount: "1" }])} className="text-xs font-semibold text-amber-700 hover:underline">
        + Add a recipe or packaging
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
