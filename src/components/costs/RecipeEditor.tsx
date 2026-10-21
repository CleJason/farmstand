"use client";

import { useMemo, useState } from "react";
import { costRecipe, money, UNITS, type CostIngredient } from "@/lib/costs";
import { buttonClass, ghostClass, inputClass, unitPrice, type RecipeRow, type TabProps } from "@/components/costs/shared";

type Line = { ingredientId: string; quantity: string; unit: string; note: string };

const unitsFor = (baseUnit: string | undefined) =>
  baseUnit === "pc" ? UNITS.count : [...UNITS.weight, ...UNITS.volume];

/** Add or change a recipe: its ingredients, how many it makes, bake time and price. Costs update as you type. */
export default function RecipeEditor({
  data,
  save,
  recipe,
  onClose,
}: TabProps & { recipe?: RecipeRow; onClose: () => void }) {
  const [name, setName] = useState(recipe?.name ?? "");
  const [yieldCount, setYieldCount] = useState(String(recipe?.yieldCount ?? 12));
  const [yieldLabel, setYieldLabel] = useState(recipe?.yieldLabel ?? "cookies");
  const [hours, setHours] = useState(String(recipe?.overheadHours ?? 0));
  const [sellPrice, setSellPrice] = useState(recipe?.sellPrice != null ? (recipe.sellPrice / 100).toFixed(2) : "");
  const [sellPer, setSellPer] = useState(recipe?.sellPer ?? "batch");
  const [notes, setNotes] = useState(recipe?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(
    recipe?.lines.map((l) => ({ ingredientId: l.ingredientId, quantity: String(l.quantity), unit: l.unit, note: l.note ?? "" })) ?? []
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ingredients = useMemo(() => new Map<string, CostIngredient>(data.ingredients.map((i) => [i.id, i])), [data.ingredients]);
  const byId = useMemo(() => new Map(data.ingredients.map((i) => [i.id, i])), [data.ingredients]);

  const cost = costRecipe(
    {
      yieldCount: Number(yieldCount) || 1,
      overheadHours: Number(hours) || 0,
      sellPrice: sellPrice ? Math.round(Number(sellPrice) * 100) : null,
      sellPer,
      lines: lines.map((l) => ({ ingredientId: l.ingredientId, quantity: Number(l.quantity) || 0, unit: l.unit })),
    },
    ingredients,
    data.settings.overheadRate
  );

  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const pickIngredient = async (i: number, value: string) => {
    if (value !== "__new") {
      const ing = byId.get(value);
      const units = unitsFor(ing?.baseUnit);
      setLine(i, { ingredientId: value, unit: units.includes(lines[i].unit) ? lines[i].unit : ing?.baseUnit ?? "g" });
      return;
    }
    const newName = prompt("New ingredient or packaging item:");
    if (!newName?.trim()) return;
    const base = prompt('How is it measured? Type g (weighed), ml (liquid) or pc (counted):', "g")?.trim().toLowerCase();
    const { error, data: fresh } = await save("/api/costs/ingredients", "POST", {
      name: newName,
      baseUnit: base === "ml" || base === "pc" ? base : "g",
    });
    if (error) return alert(error);
    const made = fresh?.ingredients.find((x) => x.name.toLowerCase() === newName.trim().replace(/\s+/g, " ").toLowerCase());
    if (made) setLine(i, { ingredientId: made.id, unit: made.baseUnit });
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    const { error: err } = await save("/api/costs/recipes", "POST", {
      id: recipe?.id,
      name,
      yieldCount,
      yieldLabel,
      overheadHours: hours,
      sellPrice,
      sellPer,
      notes,
      lines: lines.filter((l) => l.ingredientId),
    });
    setBusy(false);
    if (err) return setError(err);
    onClose();
  };

  const remove = async () => {
    if (!recipe || !confirm(`Delete the recipe "${recipe.name}"? Ingredients and purchases stay.`)) return;
    const { error: err } = await save(`/api/costs/recipes?id=${encodeURIComponent(recipe.id)}`, "DELETE");
    if (err) alert(err);
    else onClose();
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <label className="col-span-2 sm:col-span-2">
          <span className="block text-xs font-medium text-stone-600 mb-1">Recipe</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cinnamon Rolls" className={inputClass} />
        </label>
        <label>
          <span className="block text-xs font-medium text-stone-600 mb-1">Makes</span>
          <input type="number" min={0} step="any" value={yieldCount} onChange={(e) => setYieldCount(e.target.value)} className={inputClass} />
        </label>
        <label>
          <span className="block text-xs font-medium text-stone-600 mb-1">of</span>
          <input value={yieldLabel} onChange={(e) => setYieldLabel(e.target.value)} placeholder="cookies" className={inputClass} />
        </label>
        <label>
          <span className="block text-xs font-medium text-stone-600 mb-1">Bake/labor hours</span>
          <input type="number" min={0} step="0.05" value={hours} onChange={(e) => setHours(e.target.value)} className={inputClass} />
        </label>
        <label>
          <span className="block text-xs font-medium text-stone-600 mb-1">Sells for ($)</span>
          <div className="flex gap-1">
            <input type="number" min={0} step="0.01" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className={inputClass} />
            <select value={sellPer} onChange={(e) => setSellPer(e.target.value)} className={`${inputClass} w-auto`}>
              <option value="batch">batch</option>
              <option value="item">each</option>
            </select>
          </div>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-stone-500 text-left">
            <tr>
              <th className="py-1.5 pr-2 font-medium">Ingredient / packaging</th>
              <th className="py-1.5 pr-2 font-medium w-24">Amount</th>
              <th className="py-1.5 pr-2 font-medium w-24">Unit</th>
              <th className="py-1.5 pr-2 font-medium">Note</th>
              <th className="py-1.5 pr-2 font-medium text-right w-24">Cost</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const ing = byId.get(l.ingredientId);
              const c = cost.lines[i];
              return (
                <tr key={i} className="align-top">
                  <td className="py-1 pr-2">
                    <select value={l.ingredientId} onChange={(e) => pickIngredient(i, e.target.value)} className={inputClass}>
                      <option value="">Pick…</option>
                      {data.ingredients.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                      <option value="__new">+ New ingredient…</option>
                    </select>
                    {ing && <span className="block text-[11px] text-stone-400 mt-0.5">{unitPrice(ing.cost, ing.baseUnit)}</span>}
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" min={0} step="any" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className={inputClass} />
                  </td>
                  <td className="py-1 pr-2">
                    <select value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} className={inputClass}>
                      {unitsFor(ing?.baseUnit).map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input value={l.note} onChange={(e) => setLine(i, { note: e.target.value })} placeholder="filling, topping…" className={inputClass} />
                  </td>
                  <td className="py-1 pr-2 text-right whitespace-nowrap pt-2.5">
                    {money(c?.cost ?? 0)}
                    {c?.problem && <span className="block text-[11px] text-red-600">{c.problem}</span>}
                    {c && "estimated" in c && c.estimated && (
                      <span className="block text-[11px] text-amber-700" title="Set grams per cup on the Ingredients tab">
                        estimate
                      </span>
                    )}
                  </td>
                  <td className="py-1 pt-2">
                    <button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-stone-400 hover:text-red-600" aria-label="Remove line">
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          onClick={() => setLines([...lines, { ingredientId: "", quantity: "", unit: "g", note: "" }])}
          className="mt-2 text-xs font-semibold text-amber-700 hover:underline"
        >
          + Add ingredient
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm bg-stone-50 rounded-lg p-3">
        <div>
          <span className="block text-[11px] text-stone-500">Ingredients</span>
          {money(cost.ingredientsCost)}
        </div>
        <div>
          <span className="block text-[11px] text-stone-500">
            Overhead ({Number(hours) || 0} hr × {money(data.settings.overheadRate)})
          </span>
          {money(cost.overhead)}
        </div>
        <div>
          <span className="block text-[11px] text-stone-500">Batch cost</span>
          <b>{money(cost.batch)}</b>
        </div>
        <div>
          <span className="block text-[11px] text-stone-500">Per {yieldLabel.replace(/s$/, "") || "item"}</span>
          <b>{money(cost.perItem)}</b>
        </div>
        <div>
          <span className="block text-[11px] text-stone-500">Profit / margin</span>
          {cost.profit === null ? "—" : `${money(cost.profit)} · ${cost.margin?.toFixed(0)}%`}
        </div>
      </div>

      <label className="block">
        <span className="block text-xs font-medium text-stone-600 mb-1">Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={submit} disabled={busy || !name.trim()} className={buttonClass}>
          {busy ? "Saving…" : recipe ? "Save recipe" : "Add recipe"}
        </button>
        <button onClick={onClose} className={ghostClass}>
          Cancel
        </button>
        {recipe && (
          <button onClick={remove} className="ml-auto text-xs text-stone-400 hover:text-red-600">
            Delete recipe
          </button>
        )}
      </div>
    </div>
  );
}
