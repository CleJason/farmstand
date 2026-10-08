"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import Stars from "@/components/Stars";
import ReviewCard, { type ReviewData } from "@/components/ReviewCard";

const PREVIEW = 3;

/**
 * "What customers say" on the home page: the 3 newest reviews, plus a
 * "See all" button that slides every review out in a side panel.
 * Hidden when there are no reviews.
 */
export default function ReviewsSection() {
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    fetch("/api/reviews")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) =>
        setReviews(Array.isArray(d) ? d.filter((r: ReviewData & { visible?: boolean }) => r.visible !== false) : [])
      )
      .catch(() => {});
  }, []);

  // Esc closes the panel; the page behind doesn't scroll while it's open
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanelOpen(false);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [panelOpen]);

  if (reviews.length === 0) return null;

  const average = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  return (
    <section className="bg-gradient-to-b from-white to-amber-50/60 border-t border-amber-100">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">What customers say</h2>
            <div aria-hidden className="mt-2 h-1 w-12 rounded-full bg-amber-500/80" />
            <div className="mt-1 flex items-center gap-2 text-sm text-stone-500">
              <Stars rating={Math.round(average)} />
              <span>
                {average.toFixed(1)} from {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
              </span>
            </div>
          </div>
          {reviews.length > PREVIEW && (
            <button
              onClick={() => setPanelOpen(true)}
              className="text-sm font-semibold border border-stone-300 hover:border-stone-400 bg-white rounded-lg px-4 py-2 text-stone-800"
            >
              See all {reviews.length} reviews
            </button>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-4 items-start">
          {reviews.slice(0, PREVIEW).map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      </div>

      {/* Slide-out panel with every review */}
      <div
        className={`fixed inset-0 z-50 ${panelOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!panelOpen}
      >
        <div
          onClick={() => setPanelOpen(false)}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${panelOpen ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          role="dialog"
          aria-label="All reviews"
          className={`absolute right-0 top-0 h-full w-full sm:w-[440px] bg-[#FAFAF8] shadow-2xl flex flex-col transition-transform duration-300 ${
            panelOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-start justify-between px-5 py-4 bg-white border-b border-stone-200">
            <div>
              <h2 className="text-lg font-bold text-stone-900">Reviews</h2>
              <p className="text-sm text-stone-500">{reviews.length} total</p>
            </div>
            <button onClick={() => setPanelOpen(false)} aria-label="Close" className="p-1 text-stone-500 hover:text-stone-900">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {panelOpen && reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
          </div>
        </aside>
      </div>
    </section>
  );
}
