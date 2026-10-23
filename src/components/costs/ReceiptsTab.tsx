"use client";

import { useState } from "react";
import { buttonClass, fieldClass, shortDate, type TabProps } from "@/components/costs/shared";

const CATEGORIES = ["Ingredients", "Packaging", "Equipment", "Website & software", "Other"];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
const monthName = (ym: string) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** Whole receipts (every business expense), by month, with an optional photo of each. */
export default function ReceiptsTab({ data, save }: TabProps) {
  const [form, setForm] = useState({ date: today(), vendor: "", amount: "", description: "", category: "Ingredients", imageUrl: "" });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const vendors = [...new Set([...data.receipts.map((r) => r.vendor), ...data.purchases.map((p) => p.store ?? "")].filter(Boolean))];

  const year = String(new Date().getFullYear());
  const yearTotal = data.receipts.filter((r) => r.date.startsWith(year)).reduce((n, r) => n + r.amount, 0);
  const months = new Map<string, typeof data.receipts>();
  for (const r of data.receipts) months.set(r.date.slice(0, 7), [...(months.get(r.date.slice(0, 7)) ?? []), r]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) return setError(json.error || "Couldn't upload the photo");
    set({ imageUrl: json.url });
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const { error } = await save("/api/costs/receipts", "POST", form);
    if (error) return setError(error);
    setForm({ ...form, vendor: "", amount: "", description: "", imageUrl: "" });
  };

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="bg-white rounded-xl border border-stone-200 p-4 grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
        <label>
          <span className="block text-xs font-medium text-stone-600 mb-1">Date</span>
          <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} className={fieldClass} />
        </label>
        <label>
          <span className="block text-xs font-medium text-stone-600 mb-1">Store</span>
          <input list="receipt-vendors" value={form.vendor} onChange={(e) => set({ vendor: e.target.value })} placeholder="Costco" className={fieldClass} />
          <datalist id="receipt-vendors">
            {vendors.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
        <label>
          <span className="block text-xs font-medium text-stone-600 mb-1">Total ($)</span>
          <input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => set({ amount: e.target.value })} className={fieldClass} />
        </label>
        <label className="col-span-2">
          <span className="block text-xs font-medium text-stone-600 mb-1">What was bought</span>
          <input value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Flour, butter, eggs" className={fieldClass} />
        </label>
        <label>
          <span className="block text-xs font-medium text-stone-600 mb-1">Category</span>
          <select value={form.category} onChange={(e) => set({ category: e.target.value })} className={fieldClass}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="col-span-2 sm:col-span-3 text-xs text-stone-600">
          <span className="block font-medium mb-1">Receipt photo or PDF (optional)</span>
          {/* No capture="environment": on a phone that would force the camera and hide PDFs */}
          <input type="file" accept="image/*,application/pdf" onChange={(e) => upload(e.target.files?.[0])} className="text-xs" />
          {uploading && <span className="ml-2 text-stone-400">Uploading…</span>}
          {form.imageUrl && <span className="ml-2 text-green-700">✓ attached</span>}
        </label>
        <div className="col-span-2 sm:col-span-3 flex justify-end">
          <button disabled={!form.vendor.trim() || !form.amount || uploading} className={buttonClass}>
            + Add receipt
          </button>
        </div>
        {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
        <p className="col-span-full text-[11px] text-stone-500">
          Log every receipt here (for your records and taxes). The ingredient lines on it go in Purchases, which is what
          recipe costs use. Each receipt shows how much of it is itemized there.
        </p>
      </form>

      <p className="text-sm text-stone-600">
        {year} so far: <b className="text-stone-900">{dollars(yearTotal)}</b> across {data.receipts.filter((r) => r.date.startsWith(year)).length} receipts
      </p>

      {[...months.entries()].map(([ym, list]) => (
        <div key={ym} className="bg-white rounded-xl border border-stone-200 overflow-x-auto">
          <div className="px-4 py-2.5 text-sm font-semibold text-stone-900 border-b border-stone-100 flex justify-between">
            <span>{monthName(ym)}</span>
            <span>{dollars(list.reduce((n, r) => n + r.amount, 0))}</span>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-stone-100">
              {list.map((r) => {
                const status =
                  r.itemized === 0
                    ? { text: "not itemized", cls: "text-stone-400" }
                    : Math.abs(r.itemized - r.amount) <= Math.max(50, r.amount * 0.08)
                      ? { text: "fully itemized", cls: "text-green-700" }
                      : { text: `${dollars(r.itemized)} itemized`, cls: "text-amber-700" };
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-stone-600 w-28">{shortDate(r.date)}</td>
                    <td className="px-4 py-2.5 font-medium text-stone-900 whitespace-nowrap">{r.vendor}</td>
                    <td className="px-4 py-2.5 text-stone-600">
                      {r.description ?? "—"}
                      {r.category && <span className="ml-2 text-[11px] text-stone-400">{r.category}</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-xs whitespace-nowrap ${status.cls}`} title="Ingredient purchases logged for this store on this day">
                      {status.text}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">{dollars(r.amount)}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs">
                      {r.imageUrl && (
                        <a href={r.imageUrl} target="_blank" rel="noreferrer" className="text-amber-700 hover:underline mr-3">
                          {r.imageUrl.endsWith(".pdf") ? "PDF" : "Photo"}
                        </a>
                      )}
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete the ${r.vendor} receipt for ${dollars(r.amount)}?`)) return;
                          const { error } = await save(`/api/costs/receipts?id=${encodeURIComponent(r.id)}`, "DELETE");
                          if (error) alert(error);
                        }}
                        className="text-stone-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      {!data.receipts.length && (
        <p className="bg-white rounded-xl border border-stone-200 p-6 text-center text-sm text-stone-400">
          No receipts yet. Add one above, or import your receipt tracker on the Import / Export tab.
        </p>
      )}
    </div>
  );
}
