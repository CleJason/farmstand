"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { useSite } from "@/components/SiteProvider";

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
  allowedEmails: string[];
}

type Form = {
  allowedEmails: string[]; // personal code: only these customers
  code: string;
  type: "PERCENT" | "AMOUNT";
  value: string; // percent or dollars
  appliesTo: "ALL" | "DROP" | "FARMSTAND";
  minSubtotal: string; // dollars
  maxUses: string;
  expiresAt: string; // yyyy-mm-dd
};

const emptyForm: Form = {
  code: "",
  type: "PERCENT",
  value: "",
  appliesTo: "ALL",
  minSubtotal: "",
  maxUses: "",
  expiresAt: "",
  allowedEmails: [],
};

const inputClass =
  "w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500";

const describe = (d: DiscountCode) => (d.type === "PERCENT" ? `${d.value}% off` : `${formatPrice(d.value)} off`);

export default function AdminDiscountsPage() {
  const site = useSite();
  const appliesLabel = {
    ALL: "Everything",
    DROP: "Pre-orders only",
    FARMSTAND: `${site.SITE_FARMSTAND_HEADING} only`,
  };
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

  // Customers to pick from for personal codes
  const [customers, setCustomers] = useState<{ name: string | null; email: string }[]>([]);
  const [pick, setPick] = useState("");
  useEffect(() => {
    fetch("/api/customers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: { name: string | null; email: string | null }[]) =>
        setCustomers(Array.isArray(d) ? d.filter((c) => c.email).map((c) => ({ name: c.name, email: c.email!.toLowerCase() })) : [])
      )
      .catch(() => {});
  }, []);
  const nameFor = (email: string) => customers.find((c) => c.email === email)?.name;
  const addCustomer = () => {
    const email = pick.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Pick a customer, or type their email");
    setError(null);
    if (!form.allowedEmails.includes(email)) set({ allowedEmails: [...form.allowedEmails, email] });
    setPick("");
  };

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
      allowedEmails: d.allowedEmails ?? [],
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
      allowedEmails: form.allowedEmails,
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
                  {d.allowedEmails?.length > 0 && (
                    <div className="text-amber-800">
                      Only for: {d.allowedEmails.map((e) => nameFor(e) ?? e).join(", ")}
                    </div>
                  )}
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            {/* Always-visible close button, so long forms don't need scrolling to Cancel */}
            <button
              type="button"
              onClick={() => setShowModal(false)}
              aria-label="Close"
              className="sticky top-0 float-right -mt-2 -mr-2 z-10 w-9 h-9 rounded-full bg-white shadow border border-stone-200 text-stone-500 hover:text-stone-900 text-lg leading-none"
            >
              ✕
            </button>
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
                  <option value="FARMSTAND">{site.SITE_FARMSTAND_HEADING} only</option>
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
              <div>
                <span className="block text-xs font-medium text-stone-600 mb-1">Only for these customers (optional)</span>
                <div className="flex gap-2">
                  <input
                    list="discount-customers"
                    value={pick}
                    onChange={(e) => setPick(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomer();
                      }
                    }}
                    placeholder="Start typing a name or email"
                    className={inputClass}
                  />
                  <button type="button" onClick={addCustomer} className="px-3 text-sm font-semibold rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50">
                    Add
                  </button>
                </div>
                <datalist id="discount-customers">
                  {customers.map((c) => (
                    <option key={c.email} value={c.email}>
                      {c.name ?? ""}
                    </option>
                  ))}
                </datalist>
                {form.allowedEmails.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.allowedEmails.map((e) => (
                      <span key={e} className="inline-flex items-center gap-1 text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-full pl-2.5 pr-1 py-0.5">
                        {nameFor(e) ? `${nameFor(e)} · ${e}` : e}
                        <button
                          type="button"
                          aria-label={`Remove ${e}`}
                          onClick={() => set({ allowedEmails: form.allowedEmails.filter((x) => x !== e) })}
                          className="px-1 text-amber-700 hover:text-red-600"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-stone-400 mt-1">Leave empty and anyone can use the code.</p>
                )}
                {form.allowedEmails.length > 0 && (
                  <p className="text-[11px] text-stone-400 mt-1">
                    It only works when the order uses one of these emails. Set Max uses to 1 for a one-time code.
                  </p>
                )}
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
