"use client";

import { useEffect, useState } from "react";
import Stars from "@/components/Stars";

interface Review {
  id: string;
  name: string;
  rating: number;
  body: string;
  source: string | null;
  reviewDate: string;
  visible: boolean;
}

type Form = { name: string; rating: number; body: string; source: string; reviewDate: string };

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (): Form => ({ name: "", rating: 5, body: "", source: "", reviewDate: today() });

const inputClass =
  "w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500";

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [error, setError] = useState<string | null>(null);

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
    setForm({ name: r.name, rating: r.rating, body: r.body, source: r.source ?? "", reviewDate: r.reviewDate.slice(0, 10) });
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
            <div key={r.id} className={`bg-white rounded-xl border border-stone-200 p-4 space-y-2 ${!r.visible ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <Stars rating={r.rating} />
                <span className="text-[11px] text-stone-400">
                  {new Date(r.reviewDate).toLocaleDateString("en-US")}
                  {r.source && ` · ${r.source}`}
                </span>
              </div>
              <p className="text-sm text-stone-700 whitespace-pre-line line-clamp-4">{r.body}</p>
              <p className="text-xs font-semibold text-stone-900">— {r.name}</p>
              <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
                <button onClick={() => openEdit(r)} className="text-xs font-medium px-2.5 py-1 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700">
                  Edit
                </button>
                <button
                  onClick={() => toggle(r)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-md ${r.visible ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
                >
                  {r.visible ? "Shown" : "Hidden"}
                </button>
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
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
