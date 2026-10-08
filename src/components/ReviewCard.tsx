"use client";

import { useState } from "react";
import Stars from "@/components/Stars";
import { useSite } from "@/components/SiteProvider";

export interface ReviewData {
  id: string;
  name: string;
  rating: number;
  body: string;
  products: string | null;
  reply: string | null;
  reviewDate: string;
}

const LONG = 180;

/** One review, Hotplate-style: name/date, stars, product tags, text, and the shop's reply. */
export default function ReviewCard({ review }: { review: ReviewData }) {
  const site = useSite();
  const [expanded, setExpanded] = useState(false);
  const isLong = review.body.length > LONG;
  const text = isLong && !expanded ? `${review.body.slice(0, LONG).trimEnd()}…` : review.body;
  const products = (review.products ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <figure className="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col gap-3 text-left">
      <div className="flex items-baseline justify-between gap-2">
        <figcaption className="font-semibold text-stone-900">{review.name}</figcaption>
        <span className="text-xs text-stone-400 shrink-0">
          {new Date(review.reviewDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      </div>
      <Stars rating={review.rating} size="lg" />
      {products.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {products.map((p) => (
            <span key={p} className="text-[11px] font-medium text-stone-600 border border-stone-200 rounded-md px-2 py-0.5">
              {p}
            </span>
          ))}
        </div>
      )}
      <blockquote className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">
        {text}{" "}
        {isLong && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="underline text-stone-900">
            {expanded ? "See less" : "See more"}
          </button>
        )}
      </blockquote>
      {review.reply && (
        <div className="border-l-2 border-stone-200 pl-3 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-stone-700">
            {site.SITE_LOGO_URL && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={site.SITE_LOGO_URL} alt="" className="h-4 w-4 rounded-full object-cover" />
            )}
            {site.SITE_NAME}
          </div>
          <p className="text-sm text-stone-600 whitespace-pre-line">{review.reply}</p>
        </div>
      )}
    </figure>
  );
}
