"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";

export type AppliedDiscount = { code: string; discount: number } | null;

/**
 * "Discount code [Apply]" for checkout. Re-checks when the cart total changes
 * (e.g. a minimum order is no longer met). The server re-validates on order.
 */
export default function DiscountInput({
  type,
  subtotal,
  email = "",
  onChange,
}: {
  type: "DROP" | "FARMSTAND";
  subtotal: number;
  email?: string; // for personal codes that only work for certain customers
  onChange: (applied: AppliedDiscount) => void;
}) {
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<AppliedDiscount>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async (value: string) => {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/discounts/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value, type, subtotal, email }),
      }).then((r) => r.json());
      const next = res.valid ? { code: res.code as string, discount: res.discount as number } : null;
      setApplied(next);
      onChange(next);
      if (!res.valid) setError(res.error || "That code isn't valid");
    } catch {
      setError("Couldn't check that code");
    } finally {
      setChecking(false);
    }
  };

  // Recalculate when the cart (or the email, for personal codes) changes after a code was applied
  useEffect(() => {
    if (applied) check(applied.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, email]);

  const remove = () => {
    setApplied(null);
    setCode("");
    setError(null);
    onChange(null);
  };

  return (
    <div className="space-y-1.5">
      {applied ? (
        <div className="flex items-center justify-between text-sm bg-emerald-50 text-emerald-800 rounded-xl px-3.5 py-2.5">
          <span>
            <span className="font-mono font-semibold">{applied.code}</span> applied: −{formatPrice(applied.discount)}
          </span>
          <button type="button" onClick={remove} className="text-xs underline">
            Remove
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Discount code"
            className="flex-1 text-sm px-3.5 py-2.5 border border-stone-200 rounded-xl font-mono focus:outline-none focus:border-amber-600"
          />
          <button
            type="button"
            disabled={!code.trim() || checking || subtotal <= 0}
            onClick={() => check(code)}
            className="px-4 text-sm font-semibold rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            {checking ? "…" : "Apply"}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
