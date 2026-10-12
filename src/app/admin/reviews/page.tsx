"use client";

import { useEffect, useState } from "react";
import Stars from "@/components/Stars";
import ReviewCard from "@/components/ReviewCard";
import ReviewPhotoPicker from "@/components/ReviewPhotoPicker";

interface Review {
  id: string;
  name: string;
  rating: number;
  body: string;
  source: string | null;
  products: string | null;
  reply: string | null;
  reviewDate: string;
  visible: boolean;
  email: string | null;
  orderId: string | null;
  rewardCode: string | null;
  images: string[];
}

/** Ask-for-review frequency and the first-review thank-you discount. */
function ReviewRequestSettings() {
  const [days, setDays] = useState("30");
  const [percent, setPercent] = useState("10");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings/reviews")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setDays(String(d.days));
          setPercent(String(d.percent));
        }
      })
      .catch(() => {});
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/settings/reviews", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: Number(days), percent: Number(percent) }),
    });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Saved." : d.error || "Couldn't save");
  };

  return (
    <form onSubmit={save} className="bg-white rounded-xl border border-stone-200 p-4 space-y-3 max-w-2xl">
      <div>
        <h2 className="text-sm font-semibold text-stone-900">Customer reviews</h2>
        <p className="text-xs text-stone-500 mt-0.5">
          When you mark an order Picked Up, the customer gets a &quot;How was everything?&quot; email with a review link.
          New reviews stay hidden until you click Approve.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="block text-xs text-stone-600 mb-1">Ask each customer at most once every</span>
          <span className="flex items-center gap-2">
            <input type="number" min="0" max="365" value={days} onChange={(e) => setDays(e.target.value)} className={`${inputClass} w-20`} />
            days
          </span>
        </label>
        <label className="block">
          <span className="block text-xs text-stone-600 mb-1">First review earns</span>
          <span className="flex items-center gap-2">
            <input type="number" min="0" max="100" value={percent} onChange={(e) => setPercent(e.target.value)} className={`${inputClass} w-20`} />
            % off (0 = none)
          </span>
        </label>
        <button className="bg-stone-900 hover:bg-stone-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">Save</button>
        {msg && <span className="text-xs text-stone-500">{msg}</span>}
      </div>
      <p className="text-[11px] text-stone-400">
        The code is single-use, made automatically and emailed to them. Codes you&apos;ve promised before can be added under
        Discounts (set Max uses to 1).
      </p>
    </form>
  );
}

type Form = {
  name: string;
  rating: number;
  body: string;
  source: string;
  products: string;
  reply: string;
  reviewDate: string;
  email: string; // the customer who wrote it (optional)
  images: string[];
};

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (): Form => ({
  name: "",
  rating: 5,
  body: "",
  source: "",
  products: "",
  reply: "",
  reviewDate: today(),
  email: "",
  images: [],
});

const inputClass =
  "w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500";

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  // For linking a review to a customer
  const [customers, setCustomers] = useState<{ name: string | null; email: string }[]>([]);
  useEffect(() => {
    fetch("/api/customers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: { name: string | null; email: string | null }[]) =>
        setCustomers(Array.isArray(d) ? d.filter((c) => c.email).map((c) => ({ name: c.name, email: c.email! })) : [])
      )
      .catch(() => {});
  }, []);

  const load = () =>
    fetch("/api/reviews")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setReviews(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setShowModal(true);
  };

  const openEdit = (r: Review) => {
    setEditingId(r.id);
    setForm({
      name: r.name,
      rating: r.rating,
      body: r.body,
      source: r.source ?? "",
      products: r.products ?? "",
      reply: r.reply ?? "",
      reviewDate: r.reviewDate.slice(0, 10),
      email: r.email ?? "",
      images: r.images ?? [],
    });
    setError(null);
    setShowModal(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch(editingId ? `/api/reviews/${editingId}` : "/api/reviews", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, reviewDate: new Date(`${form.reviewDate}T12:00:00`).toISOString() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Couldn't save");
      return;
    }
    // Keep the form open for quickly adding several (e.g. copying from Hotplate)
    if (editingId) setShowModal(false);
    else setForm({ ...emptyForm(), source: form.source });
    load();
  };

  const toggle = async (r: Review) => {
    await fetch(`/api/reviews/${r.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible: !r.visible }),
    });
    load();
  };

  const remove = async (r: Review) => {
    if (!confirm(`Delete the review from ${r.name}?`)) return;
    await fetch(`/api/reviews/${r.id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Reviews</h1>
          <p className="text-sm text-stone-500 mt-0.5">Shown on your home page. Add ones from other sites by hand.</p>
        </div>
        <button onClick={openNew} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm px-4 py-2 rounded-lg">
          + Add Review
        </button>
      </div>

      <ReviewRequestSettings />

      {reviews.some((r) => r.orderId && !r.visible) && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {reviews.filter((r) => r.orderId && !r.visible).length} new customer review(s) waiting for your approval.
        </p>
      )}

      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-5 h-5 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="bg-white rounded-xl p-10 border border-stone-200 text-center">
          <p className="text-stone-500 font-medium">No reviews yet</p>
          <p className="text-xs text-stone-400 mt-1">Click “Add Review” to bring in reviews from Hotplate or anywhere else.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {reviews.map((r) => (
            <div key={r.id} className={`space-y-2 ${!r.visible ? "opacity-60" : ""}`}>
              {/* Same card customers see on the home page */}
              <ReviewCard review={r} />
              <div className="flex flex-wrap items-center gap-2 px-1">
                {r.orderId && !r.visible && (
                  <span className="text-[11px] font-semibold text-white bg-amber-600 rounded-full px-2 py-0.5">New</span>
                )}
                {r.source && <span className="text-[11px] text-stone-400">From {r.source}</span>}
                {r.email && <span className="text-[11px] text-stone-400">{r.email}</span>}
                {r.rewardCode && <span className="text-[11px] text-stone-400">· got code {r.rewardCode}</span>}
                {!r.reply && <span className="text-[11px] text-amber-700">No reply yet</span>}
              </div>
              <div className="flex items-center gap-2 px-1">
                <button onClick={() => openEdit(r)} className="text-xs font-medium px-2.5 py-1 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700">
                  {r.reply ? "Edit" : "Edit / Reply"}
                </button>
                {r.orderId && !r.visible ? (
                  <button
                    onClick={() => toggle(r)}
                    className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    ✓ Approve
                  </button>
                ) : (
                  <button
                    onClick={() => toggle(r)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-md ${r.visible ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
                  >
                    {r.visible ? "Shown" : "Hidden"}
                  </button>
                )}
                <button onClick={() => remove(r)} className="ml-auto text-xs text-stone-400 hover:text-red-600">
                  Delete
                </button>
              </div>
            </div>
          ))}
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
            <h2 className="text-lg font-bold text-stone-900 mb-4">{editingId ? "Edit Review" : "Add Review"}</h2>
            <form onSubmit={save} className="space-y-3">
              <div>
                <span className="block text-xs font-medium text-stone-600 mb-1">Rating</span>
                <Stars rating={form.rating} onChange={(rating) => set({ rating })} size="lg" />
              </div>
              <label className="block">
                <span className="block text-xs font-medium text-stone-600 mb-1">Review *</span>
                <textarea required rows={4} value={form.body} onChange={(e) => set({ body: e.target.value })} className={inputClass} />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-stone-600 mb-1">Name *</span>
                <input required value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Sarah M." className={inputClass} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-stone-600 mb-1">Date</span>
                  <input type="date" value={form.reviewDate} onChange={(e) => set({ reviewDate: e.target.value })} className={inputClass} />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-stone-600 mb-1">From (optional)</span>
                  <input value={form.source} onChange={(e) => set({ source: e.target.value })} placeholder="e.g. Hotplate" className={inputClass} />
                </label>
              </div>
              <label className="block">
                <span className="block text-xs font-medium text-stone-600 mb-1">Products (optional)</span>
                <input
                  value={form.products}
                  onChange={(e) => set({ products: e.target.value })}
                  placeholder="e.g. Mini Cinnamon Rolls, The Sunday Roll"
                  className={inputClass}
                />
                <span className="block text-[11px] text-stone-400 mt-1">Separate with commas. Shown as tags on the review.</span>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-stone-600 mb-1">Customer (optional)</span>
                <input
                  list="review-customers"
                  value={form.email}
                  onChange={(e) => set({ email: e.target.value })}
                  placeholder="Start typing a name or email"
                  className={inputClass}
                />
                <datalist id="review-customers">
                  {customers.map((c) => (
                    <option key={c.email} value={c.email}>
                      {c.name ?? ""}
                    </option>
                  ))}
                </datalist>
                <span className="block text-[11px] text-stone-400 mt-1">
                  Links the review to their profile, so they aren&apos;t offered the first-review discount again.
                </span>
              </label>
              <ReviewPhotoPicker images={form.images} onChange={(images) => set({ images })} label="Photos (optional, up to 4)" />
              <label className="block">
                <span className="block text-xs font-medium text-stone-600 mb-1">Your reply (optional)</span>
                <textarea
                  rows={3}
                  value={form.reply}
                  onChange={(e) => set({ reply: e.target.value })}
                  placeholder="Shown under the review with your shop name"
                  className={inputClass}
                />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              {!editingId && <p className="text-[11px] text-stone-400">After saving, the form stays open so you can add the next one.</p>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-stone-200 py-2 rounded-lg text-sm text-stone-600">
                  {editingId ? "Cancel" : "Done"}
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
