"use client";

import { useState } from "react";
import { money } from "@/lib/costs";
import { buttonClass, ghostClass, inputClass, type TabProps } from "@/components/costs/shared";
import ProductRecipes, { linkRef, linksCost, refCost, saveTags, tagsFor, type RecipeTag } from "@/components/costs/ProductRecipes";

type ProductRow = TabProps["data"]["products"][number];

/**
 * What each product costs to make: tag the recipes it uses and how much of
 * each (a Sunday Roll 4-pack = 4 cinnamon rolls + 4 rolls' worth of frosting),
 * then its cost, profit and margin come from the price it sells for.
 */
export default function ProductsTab({ data, save }: TabProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const costOf = (p: ProductRow) => (p.links.length ? linksCost(data, p.links) : null);
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
          Mix &amp; match boxes cost what&apos;s picked, so tag their choices (listed below the products, or in the product editor); tag the box itself only with what every box has, like packaging.
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
                                const c = refCost(data, linkRef(l));
                                return c ? `${l.itemsPerUnit} ${c.unit} ${c.name}` : null;
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
  const [tags, setTags] = useState<RecipeTag[]>(tagsFor(data, p.name));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await saveTags(p.name, tags);
      // Refresh the Costs data
      const { error: err } = await save("/api/costs", "GET");
      if (err) setError(err);
      else onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
      <p className="text-xs font-medium text-stone-600">One {p.name} uses:</p>
      <ProductRecipes data={data} tags={tags} onChange={setTags} priceDollars={p.price !== null ? String(p.price / 100) : ""} />
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