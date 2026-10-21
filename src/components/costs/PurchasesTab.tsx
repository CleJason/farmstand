"use client";

import { useState } from "react";
import { UNITS } from "@/lib/costs";
import { amount, buttonClass, inputClass, shortDate, unitPrice, type TabProps } from "@/components/costs/shared";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** The purchase log: add what you bought (in lb, oz, kg, qt… as on the package) and see past purchases. */
export default function PurchasesTab({ data, save }: TabProps) {
  const [form, setForm] = useState({ date: today(), store: "", item: "", quantity: "", unit: "lb", price: "" });
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const byId = new Map(data.ingredients.map((i) => [i.id, i]));
  const stores = [...new Set(data.purchases.map((p) => p.store).filter(Boolean))] as string[];
  const q = search.trim().toLowerCase();
  const list = data.purchases.filter(
    (p) => !q || byId.get(p.ingredientId)?.name.toLowerCase().includes(q) || p.store?.toLowerCase().includes(q)
  );
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = data.purchases.filter((p) => p.date.slice(0, 7) === month).reduce((n, p) => n + p.price, 0) / 100;

  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const pickItem = (item: string) => {
    // Suggest the unit this item is usually bought in
    const ing = data.ingredients.find((i) => i.name.toLowerCase() === item.trim().toLowerCase());
    set({ item, ...(ing && ing.baseUnit === "pc" ? { unit: "pc" } : ing?.baseUnit === "ml" && !UNITS.volume.includes(form.unit) ? { unit: "fl oz" } : {}) });
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const ing = data.ingredients.find((i) => i.name.toLowerCase() === form.item.trim().toLowerCase());
    const { error } = await save("/api/costs/purchases", "POST", {
      ingredientId: ing?.id,
      ingredientName: form.item,
      date: form.date,
      store: form.store,
      quantity: form.quantity,
      unit: form.unit,
      price: form.price,
    });
    setBusy(false);
    if (error) return setError(error);
    setForm({ ...form, item: "", quantity: "", price: "" }); // keep date + store for the rest of the receipt
  };

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="bg-white rounded-xl border border-stone-200 p-4 grid grid-cols-2 sm:grid-cols-7 gap-2 items-end">
        <label>
          <span className="block text-xs font-medium text-stone-600 mb-1">Date</span>
          <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} className={inputClass} />
        </label>
        <label>
          <span className="block text-xs font-medium text-stone-600 mb-1">Store</span>
          <input list="cost-stores" value={form.store} onChange={(e) => set({ store: e.target.value })} placeholder="Costco" className={inputClass} />
          <datalist id="cost-stores">
            {stores.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="col-span-2">
          <span className="block text-xs font-medium text-stone-600 mb-1">Item</span>
          <input list="cost-items" value={form.item} onChange={(e) => pickItem(e.target.value)} placeholder="Bread Flour" className={inputClass} />
          <datalist id="cost-items">
            {data.ingredients.map((i) => (
              <option key={i.id} value={i.name} />
            ))}
          </datalist>
        </label>
        <label>
          <span className="block text-xs font-medium text-stone-600 mb-1">Amount</span>
          <div className="flex gap-1">
            <input type="number" min={0} step="any" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} className={inputClass} />
            <select value={form.unit} onChange={(e) => set({ unit: e.target.value })} className={`${inputClass} w-auto`}>
              {[...UNITS.weight, ...UNITS.volume, ...UNITS.count].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </label>
        <label>
          <span className="block text-xs font-medium text-stone-600 mb-1">Paid ($)</span>
          <input type="number" min={0} step="0.01" value={form.price} onChange={(e) => set({ price: e.target.value })} className={inputClass} />
        </label>
        <button disabled={busy || !form.item.trim() || !form.quantity || !form.price} className={buttonClass}>
          {busy ? "Adding…" : "+ Add"}
        </button>
        {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
        <p className="col-span-full text-[11px] text-stone-500">
          Enter the package size as printed (5 lb, 32 oz, 1 gal, 18 count). A new item name adds it to Ingredients.
        </p>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item or store" className={`${inputClass} sm:w-72`} />
        <span className="text-sm text-stone-600">
          This month: <b className="text-stone-900">${thisMonth.toFixed(2)}</b> · {data.purchases.length} purchases logged
        </span>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-stone-500 text-left border-b border-stone-100">
            <tr>
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Store</th>
              <th className="px-4 py-2.5 font-medium">Item</th>
              <th className="px-4 py-2.5 font-medium">Amount</th>
              <th className="px-4 py-2.5 font-medium text-right">Paid</th>
              <th className="px-4 py-2.5 font-medium text-right">Unit price</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {list.slice(0, 500).map((p) => {
              const ing = byId.get(p.ingredientId);
              return (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-stone-600">{shortDate(p.date)}</td>
                  <td className="px-4 py-2.5 text-stone-600">{p.store ?? "—"}</td>
                  <td className="px-4 py-2.5 font-medium text-stone-900">{ing?.name ?? "?"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-stone-600">{amount(p.quantity, ing?.baseUnit ?? "g")}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">${(p.price / 100).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-stone-500">
                    {unitPrice(p.quantity ? p.price / 100 / p.quantity : null, ing?.baseUnit ?? "g")}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete this ${ing?.name ?? ""} purchase?`)) return;
                        const { error } = await save(`/api/costs/purchases?id=${encodeURIComponent(p.id)}`, "DELETE");
                        if (error) alert(error);
                      }}
                      className="text-xs text-stone-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length && <p className="p-6 text-center text-sm text-stone-400">No purchases{q ? " match" : " yet"}.</p>}
        {list.length > 500 && <p className="p-3 text-center text-xs text-stone-400">Showing the latest 500. Search to find older ones.</p>}
      </div>
    </div>
  );
}
