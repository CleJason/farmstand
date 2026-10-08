"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";

export type AppliedGift = { code: string; amount: number; balance: number } | null;

/** "Gift card code [Apply]" for checkout; covers up to `amountDue`. Server re-checks on order. */
export default function GiftCardInput({
  amountDue,
  onChange,
}: {
  amountDue: number;
  onChange: (applied: AppliedGift) => void;
}) {
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<AppliedGift>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async (value: string) => {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/gift-cards/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value, amountDue }),
      }).then((r) => r.json());
      const next = res.valid ? { code: res.code as string, amount: res.amount as number, balance: res.balance as number } : null;
      setApplied(next);
      onChange(next);
      if (!res.valid) setError(res.error || "That gift card isn't valid");
    } catch {
      setError("Couldn't check that gift card");
    } finally {
      setChecking(false);
    }
  };

  // Recalculate when the amount due changes (cart or discount changed)
  useEffect(() => {
    if (applied) check(applied.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountDue]);

  const remove = () => {
    setApplied(null);
    setCode("");
    setError(null);
    onChange(null);
  };

  return (
    <div className="space-y-1.5">
      {applied ? (
        <div className="flex items-center justify-between gap-2 text-sm bg-emerald-50 text-emerald-800 rounded-xl px-3.5 py-2.5">
          <span>
            🎁 <span className="font-mono font-semibold">{applied.code}</span>: −{formatPrice(applied.amount)}
            <span className="block text-[11px] text-emerald-700">
              {formatPrice(applied.balance - applied.amount)} will be left on the card
            </span>
          </span>
          <button type="button" onClick={remove} className="text-xs underline shrink-0">
            Remove
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Gift card code"
            className="flex-1 text-sm px-3.5 py-2.5 border border-stone-200 rounded-xl font-mono focus:outline-none focus:border-amber-600"
          />
          <button
            type="button"
            disabled={!code.trim() || checking || amountDue <= 0}
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
