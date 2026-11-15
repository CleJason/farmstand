"use client";

import { useState } from "react";
import { money } from "@/lib/costs";
import { buttonClass, ghostClass, inputClass, type TabProps } from "@/components/costs/shared";

type ProductRow = TabProps["data"]["products"][number];

/**
 * What each product costs to make: tag the recipes it uses and how much of
 * each (a Sunday Roll 4-pack = 4 cinnamon rolls + 4 rolls' worth of frosting),
 * then its cost, profit and margin come from the price it sells for.
 */
export default function ProductsTab({ data, save }: TabProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const perItem = new Map(data.recipes.map((r) => [r.id, r.cost.perItem]));
  const costOf = (p: ProductRow) =>
    p.links.length ? p.links.reduce((s, l) => s + (perItem.get(l.recipeId) ?? 0) * l.itemsPerUnit, 0) : null;
  const q = search.trim().toLowerCase();
  const list = data.products.filter((p) => !q || p.name.toLowerCase().includes(q));
  const untagged = data.products.filter((p) => p.active && !p.isBox && !p.links.length).length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-stone-200 p-4 text-xs text-stone-500 space-y-1">
        <p>
          Tag the recipes each product uses and how much of each, in the recipe&apos;s own units: a 4-pack of rolls uses{" "}
          <b>4</b> of a Cinnamon Rolls recipe that makes 8 rolls, plus frosting. If the frosting recipe is set up as making
          24 rolls&apos; worth, that&apos;s <b>4</b> of it too; a streusel that tops 6 batches is <b>1</b> of it per batch.
        </p>
        <p>
          Mix &amp; match boxes cost what&apos;s picked, so tag their choices (listed below the products) instead of the box.
          {untagged > 0 && <span className="text-amber-700"> {untagged} product{untagged === 1 ? "" : "s"} have no recipes yet.</span>}
        </p>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search products"
        className={`${inputClass} w-full sm:w-72`}
      />

      <div className="bg-white rounded-xl border border-stone-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-stone-500 text-left border-b border-stone-100">
            <tr>
              <th className="px-4 py-2.5 font-medium">Product</th>
              <th className="px-4 py-2.5 font-medium">Uses</th>
              <th className="px-4 py-2.5 font-medium text-right">Cost</th>
              <th className="px-4 py-2.5 font-medium text-right">Sells for</th>
              <th className="px-4 py-2.5 font-medium text-right">Profit</th>
              <th className="px-4 py-2.5 font-medium text-right">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {[...list.filter((p) => p.price !== null), ...list.filter((p) => p.price === null)].map((p) => {
              const cost = costOf(p);
              const price = p.price !== null ? p.price / 100 : null;
              const profit = cost !== null && price !== null ? price - cost : null;
              const isOpen = open === p.key;
              return (
                <Row
                  key={p.key}
                  p={p}
                  open={isOpen}
                  onToggle={() => setOpen(isOpen ? null : p.key)}
                  cells={
                    <>
                      <td className="px-4 py-3 text-xs text-stone-600">
                        {p.links.length
                          ? p.links
                              .map((l) => {
                                const r = data.recipes.find((x) => x.id === l.recipeId);
                                return r ? `${l.itemsPerUnit} ${r.yieldLabel} ${r.name}` : null;
                              })
                              .filter(Boolean)
                              .join(" + ")
                          : p.isBox
                            ? <span className="text-stone-400">from its choices</span>
                            : <span className="text-amber-700">tag recipes</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-stone-900">{money(cost)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap text-stone-600">{price === null ? (p.isBox ? "" : "box choice") : money(price)}</td>
                      <td className={`px-4 py-3 text-right whitespace-nowrap ${profit !== null && profit < 0 ? "text-red-600" : "text-stone-600"}`}>
                        {money(profit)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap text-stone-600">
                        {profit !== null && price ? `${Math.round((profit / price) * 100)}%` : "—"}
                      </td>
                    </>
                  }
                >
                  <Editor p={p} data={data} save={save} onClose={() => setOpen(null)} />
                </Row>
              );
            })}
          </tbody>
        </table>
        {!list.length && <p className="p-6 text-center text-sm text-stone-400">No products{q ? " match" : " yet"}.</p>}
      </div>
    </div>
  );
}

function Row({
  p,
  open,
  onToggle,
  cells,
  children,
}: {
  p: ProductRow;
  open: boolean;
  onToggle: () => void;
  cells: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer hover:bg-stone-50 ${open ? "bg-amber-50/40" : ""} ${p.active ? "" : "opacity-60"}`}>
        <td className="px-4 py-3 font-medium text-stone-900">{p.name}</td>
        {cells}
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="px-4 py-4 bg-stone-50">
            {children}
          </td>
        </tr>
      )}
    </>
  );
}

function Editor({ p, data, save, onClose }: TabProps & { p: ProductRow; onClose: () => void }) {
  const [links, setLinks] = useState(p.links.map((l) => ({ recipeId: l.recipeId, amount: String(l.itemsPerUnit) })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recipe = (id: string) => data.recipes.find((r) => r.id === id);
  const total = links.reduce((s, l) => s + (recipe(l.recipeId)?.cost.perItem ?? 0) * (Number(l.amount) || 0), 0);

  const submit = async () => {
    setBusy(true);
    setError("");
    const { error: err } = await save("/api/costs/links", "PUT", {
      name: p.name,
      links: links.filter((l) => l.recipeId && Number(l.amount) > 0).map((l) => ({ recipeId: l.recipeId, itemsPerUnit: l.amount })),
    });
    setBusy(false);
    if (err) return setError(err);
    onClose();
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
      <p className="text-xs font-medium text-stone-600">One {p.name} uses:</p>
      {links.map((l, i) => {
        const r = recipe(l.recipeId);
        return (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <input
              type="number"
              min={0}
              step="any"
              value={l.amount}
              onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
              className={`${inputClass} w-20`}
            />
            <span className="text-stone-600">{r?.yieldLabel ?? "of"} from</span>
            <select
              value={l.recipeId}
              onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, recipeId: e.target.value } : x)))}
              className={`${inputClass} w-56`}
            >
              <option value="">Pick a recipe…</option>
              {data.recipes.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} (makes {x.yieldCount} {x.yieldLabel})
                </option>
              ))}
            </select>
            {r && <span className="text-xs text-stone-500">{money(r.cost.perItem * (Number(l.amount) || 0))}</span>}
            <button onClick={() => setLinks(links.filter((_, j) => j !== i))} className="text-stone-400 hover:text-red-600" aria-label="Remove">
              ✕
            </button>
          </div>
        );
      })}
      <button onClick={() => setLinks([...links, { recipeId: "", amount: "1" }])} className="text-xs font-semibold text-amber-700 hover:underline">
        + Add a recipe
      </button>
      <p className="text-sm">
        Cost to make one: <b>{money(total)}</b>
        {p.price !== null && total > 0 && (
          <span className="text-stone-500">
            {" "}
            · sells for {money(p.price / 100)} · profit {money(p.price / 100 - total)}
          </span>
        )}
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy} className={buttonClass}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={onClose} className={ghostClass}>
          Cancel
        </button>
      </div>
    </div>
  );
}
