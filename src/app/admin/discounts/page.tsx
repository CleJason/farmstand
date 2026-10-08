"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";

interface DiscountCode {
  id: string;
  code: string;
  type: "PERCENT" | "AMOUNT";
  value: number;
  appliesTo: "ALL" | "DROP" | "FARMSTAND";
  minSubtotal: number | null;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  active: boolean;
}

type Form = {
  code: string;
  type: "PERCENT" | "AMOUNT";
  value: string; // percent or dollars
  appliesTo: "ALL" | "DROP" | "FARMSTAND";
  minSubtotal: string; // dollars
  maxUses: string;
  expiresAt: string; // yyyy-mm-dd
};

const emptyForm: Form = { code: "", type: "PERCENT", value: "", appliesTo: "ALL", minSubtotal: "", maxUses: "", expiresAt: "" };

const inputClass =
  "w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500";

const describe = (d: DiscountCode) => (d.type === "PERCENT" ? `${d.value}% off` : `${formatPrice(d.value)} off`);
const appliesLabel = { ALL: "Everything", DROP: "Pre-orders only", FARMSTAND: "Farmstand only" };

export default function AdminDiscountsPage() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch("/api/discounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCodes(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setShowModal(true);
  };

  const openEdit = (d: DiscountCode) => {
    setEditingId(d.id);
    setForm({
      code: d.code,
      type: d.type,
      value: d.type === "PERCENT" ? String(d.value) : (d.value / 100).toFixed(2),
      appliesTo: d.appliesTo,
      minSubtotal: d.minSubtotal !== null ? (d.minSubtotal / 100).toFixed(2) : "",
      maxUses: d.maxUses !== null ? String(d.maxUses) : "",
      expiresAt: d.expiresAt ? d.expiresAt.slice(0, 10) : "",
    });
    setError(null);
    setShowModal(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const body = {
      code: form.code,
      type: form.type,
      value: form.type === "PERCENT" ? Number(form.value) : Math.round(Number(form.value) * 100),
      appliesTo: form.appliesTo,
      minSubtotal: form.minSubtotal ? Math.round(Number(form.minSubtotal) * 100) : null,
      maxUses: form.maxUses || null,
      // Valid through the end of the chosen day
      expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
    };
    const res = await fetch(editingId ? `/api/discounts/${editingId}` : "/api/discounts", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Couldn't save");
      return;
    }
    setShowModal(false);
    load();
  };

  const toggle = async (d: DiscountCode) => {
    await fetch(`/api/discounts/${d.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !d.active }),
    });
    load();
  };

  const remove = async (d: DiscountCode) => {
    if (!confirm(`Delete code ${d.code}? Past orders that used it are not affected.`)) return;
    await fetch(`/api/discounts/${d.id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Discounts</h1>
          <p className="text-sm text-stone-500 mt-0.5">Codes customers can enter at checkout.</p>
        </div>
        <button onClick={openNew} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm px-4 py-2 rounded-lg">
          + New Code
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-5 h-5 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
        </div>
      ) : codes.length === 0 ? (
        <div className="bg-white rounded-xl p-10 border border-stone-200 text-center">
          <p className="text-stone-500 font-medium">No discount codes yet</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {codes.map((d) => {
            const expired = d.expiresAt && new Date(d.expiresAt) < new Date();
            const usedUp = d.maxUses !== null && d.uses >= d.maxUses;
            return (
              <div key={d.id} className={`bg-white rounded-xl border border-stone-200 p-4 space-y-2 ${!d.active || expired || usedUp ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-stone-900">{d.code}</span>
                  <span className="text-sm font-semibold text-amber-700">{describe(d)}</span>
                </div>
                <div className="text-xs text-stone-500 space-y-0.5">
                  <div>{appliesLabel[d.appliesTo]}</div>
                  {d.minSubtotal !== null && <div>Min order {formatPrice(d.minSubtotal)}</div>}
                  <div>
                    Used {d.uses}
                    {d.maxUses !== null ? ` of ${d.maxUses}` : ""} times
                  </div>
                  {d.expiresAt && (
                    <div>
                      {expired ? "Expired" : "Expires"} {new Date(d.expiresAt).toLocaleDateString("en-US")}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
                  <button onClick={() => openEdit(d)} className="text-xs font-medium px-2.5 py-1 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700">
                    Edit
                  </button>
                  <button
                    onClick={() => toggle(d)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-md ${d.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
                  >
                    {d.active ? "Active" : "Off"}
                  </button>
                  <button onClick={() => remove(d)} className="ml-auto text-xs text-stone-400 hover:text-red-600">
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h2 className="text-lg font-bold text-stone-900 mb-4">{editingId ? "Edit Code" : "New Discount Code"}</h2>
            <form onSubmit={save} className="space-y-3">
              <label className="block">
                <span className="block text-xs font-medium text-stone-600 mb-1">Code *</span>
                <input required value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="e.g. WELCOME10" className={`${inputClass} font-mono`} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-stone-600 mb-1">Type</span>
                  <select value={form.type} onChange={(e) => set({ type: e.target.value as Form["type"] })} className={inputClass}>
                    <option value="PERCENT">Percent off</option>
                    <option value="AMOUNT">Dollars off</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-stone-600 mb-1">{form.type === "PERCENT" ? "Percent *" : "Amount ($) *"}</span>
                  <input
                    type="number"
                    required
                    min={form.type === "PERCENT" ? 1 : 0.01}
                    max={form.type === "PERCENT" ? 100 : undefined}
                    step={form.type === "PERCENT" ? 1 : 0.01}
                    value={form.value}
                    onChange={(e) => set({ value: e.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>
              <label className="block">
                <span className="block text-xs font-medium text-stone-600 mb-1">Works on</span>
                <select value={form.appliesTo} onChange={(e) => set({ appliesTo: e.target.value as Form["appliesTo"] })} className={inputClass}>
                  <option value="ALL">Everything</option>
                  <option value="DROP">Pre-orders (drops) only</option>
                  <option value="FARMSTAND">Farmstand only</option>
                </select>
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-stone-600 mb-1">Min order ($)</span>
                  <input type="number" min="0" step="0.01" value={form.minSubtotal} onChange={(e) => set({ minSubtotal: e.target.value })} placeholder="None" className={inputClass} />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-stone-600 mb-1">Max uses</span>
                  <input type="number" min="1" value={form.maxUses} onChange={(e) => set({ maxUses: e.target.value })} placeholder="No limit" className={inputClass} />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-stone-600 mb-1">Expires</span>
                  <input type="date" value={form.expiresAt} onChange={(e) => set({ expiresAt: e.target.value })} className={inputClass} />
                </label>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-stone-200 py-2 rounded-lg text-sm text-stone-600">
                  Cancel
                </button>
                <button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 rounded-lg text-sm">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
