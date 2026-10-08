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
}

/** "What customers say" on the home page; hidden when there are no reviews. */
export default function ReviewsSection() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch("/api/reviews")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setReviews(Array.isArray(d) ? d.filter((r: Review & { visible?: boolean }) => r.visible !== false) : []))
      .catch(() => {});
  }, []);

  if (reviews.length === 0) return null;

  const average = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const shown = showAll ? reviews : reviews.slice(0, 6);

  return (
    <section className="bg-[#FAFAF8] border-t border-stone-100">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight">What customers say</h2>
          <div className="mt-2 flex items-center justify-center gap-2 text-sm text-stone-500">
            <Stars rating={Math.round(average)} />
            <span>
              {average.toFixed(1)} from {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
            </span>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((r) => (
            <figure key={r.id} className="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col gap-3">
              <Stars rating={r.rating} />
              <blockquote className="text-sm text-stone-700 leading-relaxed whitespace-pre-line flex-1">{r.body}</blockquote>
              <figcaption className="text-xs text-stone-500">
                <span className="font-semibold text-stone-900">{r.name}</span>
                {" · "}
                {new Date(r.reviewDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </figcaption>
            </figure>
          ))}
        </div>
        {reviews.length > 6 && (
          <div className="text-center mt-6">
            <button onClick={() => setShowAll((v) => !v)} className="text-sm font-semibold text-amber-700 hover:underline">
              {showAll ? "Show fewer" : `Show all ${reviews.length} reviews`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
