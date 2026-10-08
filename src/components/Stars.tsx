"use client";

/** 1–5 star display; pass onChange to make it a picker. */
export default function Stars({
  rating,
  onChange,
  size = "sm",
}: {
  rating: number;
  onChange?: (rating: number) => void;
  size?: "sm" | "lg";
}) {
  const cls = size === "lg" ? "text-2xl" : "text-sm";
  return (
    <span className={`inline-flex ${cls} leading-none`} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" onClick={() => onChange(n)} className={n <= rating ? "text-amber-500" : "text-stone-300"}>
            ★
          </button>
        ) : (
          <span key={n} className={n <= rating ? "text-amber-500" : "text-stone-300"}>
            ★
          </span>
        )
      )}
    </span>
  );
}
