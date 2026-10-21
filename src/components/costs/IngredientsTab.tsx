"use client";

import { useState } from "react";
import { suggestGramsPerCup } from "@/lib/costs";
import { amount, buttonClass, inputClass, unitPrice, type IngredientRow, type TabProps } from "@/components/costs/shared";

/** Every ingredient and packaging item: what it costs per unit, grams per cup, and merge/rename/delete. */
export default function IngredientsTab({ data, save }: TabProps) {
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [base, setBase] = useState("g");
  const [error, setError] = useState("");
  const q = search.trim().toLowerCase();
  const list = data.ingredients.filter((i) => !q || i.name.toLowerCase().includes(q));
  const needCup = data.ingredients.filter((i) => i.baseUnit === "g" && !i.gramsPerCup && i.usedIn > 0).length;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const { error } = await save("/api/costs/ingredients", "POST", { name, baseUnit: base });
    if (error) return setError(error);
    setName("");
  };

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="bg-white rounded-xl border border-stone-200 p-4 flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[200px]">
          <span className="block text-xs font-medium text-stone-600 mb-1">New ingredient or packaging</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bread Flour, 6x6 Box…" className={inputClass} />
        </label>
        <label>
          <span className="block text-xs font-medium text-stone-600 mb-1">Measured by</span>
          <select value={base} onChange={(e) => setBase(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="g">weight (g)</option>
            <option value="ml">volume (ml)</option>
            <option value="pc">count (pieces)</option>
          </select>
        </label>
        <button disabled={!name.trim()} className={buttonClass}>
          + Add
        </button>
        {error && <p className="basis-full text-sm text-red-600">{error}</p>}
        <p className="basis-full text-[11px] text-stone-500">
          Prices come from the Purchases tab. <b>Grams per cup</b> lets recipes measured in cups and spoons cost right (a cup
          of flour is about 120 g, not 237). Common ones are filled in for you; adjust to your own scoop.
          {needCup > 0 && <span className="text-amber-700"> {needCup} used in recipes still need it.</span>}
        </p>
      </form>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search ingredients"
        className={`${inputClass} sm:w-72`}
      />

      <div className="bg-white rounded-xl border border-stone-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-stone-500 text-left border-b border-stone-100">
            <tr>
              <th className="px-4 py-2.5 font-medium">Item</th>
              <th className="px-4 py-2.5 font-medium">Average</th>
              <th className="px-4 py-2.5 font-medium">Latest</th>
              <th className="px-4 py-2.5 font-medium">Bought</th>
              <th className="px-4 py-2.5 font-medium">Grams per cup</th>
              <th className="px-4 py-2.5 font-medium">Used in</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {list.map((i) => (
              <Row key={i.id} i={i} all={data.ingredients} save={save} />
            ))}
          </tbody>
        </table>
        {!list.length && <p className="p-6 text-center text-sm text-stone-400">No ingredients{q ? " match" : " yet"}.</p>}
      </div>
    </div>
  );
}

function Row({ i, all, save }: { i: IngredientRow; all: IngredientRow[]; save: TabProps["save"] }) {
  const [gpc, setGpc] = useState(i.gramsPerCup ? String(i.gramsPerCup) : "");
  const [manual, setManual] = useState(i.manualCost != null ? String(i.manualCost) : "");
  const [merging, setMerging] = useState(false);
  const put = async (body: Record<string, unknown>) => {
    const { error } = await save("/api/costs/ingredients", "PUT", { id: i.id, ...body });
    if (error) alert(error);
  };
  const suggestion = i.baseUnit !== "pc" ? suggestGramsPerCup(i.name) : null;

  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <span className="font-medium text-stone-900">{i.name}</span>
        <span className="block text-[11px] text-stone-400">{i.baseUnit === "g" ? "weighed" : i.baseUnit === "ml" ? "liquid" : "counted"}</span>
        {merging && (
          <select
            autoFocus
            defaultValue=""
            onChange={async (e) => {
              const target = all.find((x) => x.id === e.target.value);
              if (target && confirm(`Merge "${i.name}" into "${target.name}"? Its purchases and recipe lines move over.`)) {
                await put({ mergeInto: target.id });
              }
              setMerging(false);
            }}
            className={`${inputClass} mt-1 w-56`}
          >
            <option value="">Merge into…</option>
            {all
              .filter((x) => x.id !== i.id && x.baseUnit === i.baseUnit)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">{unitPrice(i.average, i.baseUnit)}</td>
      <td className="px-4 py-3 whitespace-nowrap text-stone-600">{unitPrice(i.latest, i.baseUnit)}</td>
      <td className="px-4 py-3 text-stone-600 text-xs">
        {i.purchases ? (
          <>
            {i.purchases}× · {amount(i.bought, i.baseUnit)}
            <span className="block text-stone-400">${i.spent.toFixed(2)} total</span>
          </>
        ) : (
          <label className="flex items-center gap-1" title="No purchases: use this cost instead">
            $
            <input
              type="number"
              min={0}
              step="any"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onBlur={() => manual !== (i.manualCost != null ? String(i.manualCost) : "") && put({ manualCost: manual })}
              placeholder="cost"
              className={`${inputClass} w-24`}
            />
            /{i.baseUnit}
          </label>
        )}
      </td>
      <td className="px-4 py-3">
        {i.baseUnit === "pc" ? (
          <span className="text-stone-300">—</span>
        ) : (
          <input
            type="number"
            min={0}
            step="any"
            value={gpc}
            onChange={(e) => setGpc(e.target.value)}
            onBlur={() => gpc !== (i.gramsPerCup ? String(i.gramsPerCup) : "") && put({ gramsPerCup: gpc })}
            placeholder={suggestion ? `about ${suggestion}` : "g"}
            className={`${inputClass} w-24`}
          />
        )}
      </td>
      <td className="px-4 py-3 text-stone-600">{i.usedIn ? `${i.usedIn} line${i.usedIn === 1 ? "" : "s"}` : "—"}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap text-xs">
        <button
          onClick={() => {
            const n = prompt("Rename to:", i.name);
            if (n && n.trim() !== i.name) put({ name: n });
          }}
          className="text-stone-500 hover:text-stone-900 mr-3"
        >
          Rename
        </button>
        <button onClick={() => setMerging(!merging)} className="text-stone-500 hover:text-stone-900 mr-3">
          Merge
        </button>
        <button
          onClick={async () => {
            if (!confirm(`Delete "${i.name}"${i.purchases ? ` and its ${i.purchases} purchases` : ""}?`)) return;
            const { error } = await save(`/api/costs/ingredients?id=${encodeURIComponent(i.id)}`, "DELETE");
            if (error) alert(error);
          }}
          className="text-stone-400 hover:text-red-600"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}
