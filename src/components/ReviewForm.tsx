"use client";

import { useState } from "react";
import Link from "next/link";
import Stars from "@/components/Stars";
import { useText } from "@/components/SiteProvider";

/** The customer's review form (from their emailed link). Their products come pre-tagged from the order. */
export default function ReviewForm({
  token,
  shopName,
  products,
  defaultName,
  rewardPercent,
  preview = false,
}: {
  token: string;
  preview?: boolean; // admin preview: shows the thank-you without saving

  shopName: string;
  products: string[];
  defaultName: string;
  rewardPercent: number;
}) {
  const text = useText();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [name, setName] = useState(defaultName);
  const [tags, setTags] = useState<string[]>(products);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ code: string | null; percent: number } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview) {
      setDone({ code: rewardPercent > 0 ? "THANKS-SAMPLE" : null, percent: rewardPercent });
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, rating, body, name, products: tags }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setDone({ code: data.code ?? null, percent: data.percent ?? 0 });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="text-center space-y-4">
        <div className="text-4xl">💛</div>
        <h1 className="text-2xl font-bold text-stone-900">{text("review.thanks")}</h1>
        <p className="text-sm text-stone-600">{text("review.thanksText", { shop: shopName })}</p>
        {done.code && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <p className="text-sm text-stone-800">{text("review.code", { percent: done.percent })}</p>
            <p className="text-xl font-bold tracking-widest text-stone-900 select-all">{done.code}</p>
            <p className="text-xs text-stone-500">{text("review.codeHint")}</p>
          </div>
        )}
        <Link href="/" className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-2.5 rounded-full text-sm">
          {text("review.back", { shop: shopName })}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">{text("review.title")}</h1>
        {rewardPercent > 0 && (
          <p className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {text("review.offer", { percent: rewardPercent })}
          </p>
        )}
      </div>
      <div>
        <span className="block text-xs font-medium text-stone-600 mb-1">{text("review.rating")}</span>
        <Stars rating={rating} onChange={setRating} size="lg" />
      </div>
      <label className="block">
        <span className="block text-xs font-medium text-stone-600 mb-1">{text("review.text")}</span>
        <textarea
          required
          rows={4}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={text("review.textHint")}
          className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
        />
      </label>
      {products.length > 0 && (
        <div>
          <span className="block text-xs font-medium text-stone-600 mb-1">{text("review.products")}</span>
          <div className="flex flex-wrap gap-1.5">
            {products.map((p) => {
              const on = tags.includes(p);
              return (
                <button
                  type="button"
                  key={p}
                  onClick={() => setTags(on ? tags.filter((t) => t !== p) : [...tags, p])}
                  className={`px-2.5 py-1 rounded-full border text-xs ${
                    on ? "bg-amber-600 border-amber-600 text-white" : "bg-white border-stone-200 text-stone-400 line-through"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <label className="block">
        <span className="block text-xs font-medium text-stone-600 mb-1">{text("review.name")}</span>
        <input
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sarah M."
          className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={sending}
        className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold py-3 rounded-full text-sm"
      >
        {sending ? "…" : text("review.send")}
      </button>
      <p className="text-[11px] text-stone-400 text-center">
        {text("review.note")}
      </p>
    </form>
  );
}
