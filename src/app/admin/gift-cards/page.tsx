"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";

interface GiftCard {
  id: string;
  code: string;
  initialAmount: number;
  balance: number;
  status: "PENDING" | "ACTIVE" | "VOID";
  recipientName: string | null;
  recipientEmail: string | null;
  fromName: string | null;
  message: string | null;
  purchaserEmail: string | null;
  orderId: string | null;
  createdAt: string;
}

const inputClass =
  "w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500";

const statusStyle = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  VOID: "bg-stone-100 text-stone-500",
};
const statusLabel = { ACTIVE: "Active", PENDING: "Awaiting payment", VOID: "Void" };

export default function AdminGiftCardsPage() {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ amount: "", recipientName: "", recipientEmail: "", fromName: "", message: "", sendEmail: true });

  const load = () =>
    fetch("/api/gift-cards")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCards(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/gift-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: Math.round(Number(form.amount) * 100) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || "Couldn't create gift card");
    setShowModal(false);
    setForm({ amount: "", recipientName: "", recipientEmail: "", fromName: "", message: "", sendEmail: true });
    load();
    alert(`Gift card created: ${data.code}`);
  };

  const update = async (card: GiftCard, body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    const res = await fetch(`/api/gift-cards/${card.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || "Couldn't update gift card");
    load();
  };

  const editBalance = (card: GiftCard) => {
    const input = prompt(`New balance for ${card.code} (in dollars):`, (card.balance / 100).toFixed(2));
    if (input === null) return;
    const cents = Math.round(Number(input) * 100);
    if (!Number.isFinite(cents) || cents < 0) return alert("Enter a dollar amount like 12.50");
    update(card, { balance: cents });
  };

  const q = query.trim().toLowerCase();
  const shown = q
    ? cards.filter((c) =>
        [c.code, c.recipientName, c.recipientEmail, c.purchaserEmail, c.fromName].some((v) => v?.toLowerCase().includes(q))
      )
    : cards;
  const outstanding = cards.filter((c) => c.status === "ACTIVE").reduce((s, c) => s + c.balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Gift Cards</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Sold online at <span className="font-mono">/gift</span>, or created here. Unspent balance: {formatPrice(outstanding)}
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm px-4 py-2 rounded-lg">
          + Create Gift Card
        </button>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search code, name or email"
        className={`${inputClass} max-w-sm`}
      />

      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-5 h-5 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-xl p-10 border border-stone-200 text-center">
          <p className="text-stone-500 font-medium">{cards.length ? "No gift cards match" : "No gift cards yet"}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((c) => (
            <div key={c.id} className={`bg-white rounded-xl border border-stone-200 p-4 space-y-2 ${c.status === "VOID" ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-stone-900 text-sm">{c.code}</span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusStyle[c.status]}`}>{statusLabel[c.status]}</span>
              </div>
              <div className="text-2xl font-bold text-stone-900">
                {formatPrice(c.balance)}
                <span className="text-xs font-normal text-stone-400"> of {formatPrice(c.initialAmount)}</span>
              </div>
              <div className="text-xs text-stone-500 space-y-0.5">
                {(c.recipientName || c.recipientEmail) && (
                  <div>
                    For {c.recipientName ?? ""} {c.recipientEmail && <span className="text-stone-400">({c.recipientEmail})</span>}
                  </div>
                )}
                {c.fromName && <div>From {c.fromName}</div>}
                <div>
                  {c.orderId ? `Bought online by ${c.purchaserEmail}` : "Created by you"} ·{" "}
                  {new Date(c.createdAt).toLocaleDateString("en-US")}
                </div>
                {c.message && <div className="italic">“{c.message}”</div>}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-100">
                {c.status !== "PENDING" && (
                  <button onClick={() => editBalance(c)} className="text-xs font-medium px-2.5 py-1 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700">
                    Edit balance
                  </button>
                )}
                {c.status === "ACTIVE" && c.recipientEmail && (
                  <button onClick={() => update(c, { resend: true })} className="text-xs font-medium px-2.5 py-1 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700">
                    Resend email
                  </button>
                )}
                {c.status === "ACTIVE" && (
                  <button onClick={() => update(c, { status: "VOID" }, `Void ${c.code}? It can't be used until you reactivate it.`)} className="ml-auto text-xs text-stone-400 hover:text-red-600">
                    Void
                  </button>
                )}
                {c.status === "VOID" && (
                  <button onClick={() => update(c, { status: "ACTIVE" })} className="ml-auto text-xs text-stone-500 hover:text-stone-800">
                    Reactivate
                  </button>
                )}
                {c.status === "PENDING" && (
                  <span className="text-[11px] text-stone-400">Activates when its order is marked Paid (Orders page)</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h2 className="text-lg font-bold text-stone-900 mb-1">Create Gift Card</h2>
            <p className="text-xs text-stone-500 mb-4">For cards sold in person, comps or giveaways. Active right away.</p>
            <form onSubmit={create} className="space-y-3">
              <label className="block">
                <span className="block text-xs font-medium text-stone-600 mb-1">Amount ($) *</span>
                <input type="number" required min="1" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-stone-600 mb-1">Recipient name</span>
                  <input value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} className={inputClass} />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-stone-600 mb-1">Recipient email</span>
                  <input type="email" value={form.recipientEmail} onChange={(e) => setForm({ ...form, recipientEmail: e.target.value })} className={inputClass} />
                </label>
              </div>
              <label className="block">
                <span className="block text-xs font-medium text-stone-600 mb-1">From</span>
                <input value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} className={inputClass} />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-stone-600 mb-1">Message</span>
                <textarea rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={inputClass} />
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" checked={form.sendEmail} onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })} className="h-4 w-4 accent-amber-600" />
                Email the code to the recipient (via n8n)
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-stone-200 py-2 rounded-lg text-sm text-stone-600">
                  Cancel
                </button>
                <button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 rounded-lg text-sm">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
