"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { useText } from "@/components/SiteProvider";

export type AppliedDiscount = { code: string; discount: number } | null;

/**
 * "Discount code [Apply]" for checkout. Re-checks when the cart total changes
 * (e.g. a minimum order is no longer met). The server re-validates on order.
 * Personal codes (only for certain customers) ask for the customer's email here,
 * and hand it to the page so the checkout details start with it.
 */
export default function DiscountInput({
  type,
  subtotal,
  email = "",
  onEmail,
  onChange,
}: {
  type: "DROP" | "FARMSTAND";
  subtotal: number;
  email?: string; // already known (signed in or entered at checkout)
  onEmail?: (email: string) => void;
  onChange: (applied: AppliedDiscount) => void;
}) {
  const text = useText();
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<AppliedDiscount>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [askEmail, setAskEmail] = useState(false);
  const [personalEmail, setPersonalEmail] = useState("");

  const check = async (value: string) => {
    setChecking(true);
    setError(null);
    const useEmail = personalEmail.trim() || email;
    try {
      const res = await fetch("/api/discounts/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value, type, subtotal, email: useEmail }),
      }).then((r) => r.json());
      const next = res.valid ? { code: res.code as string, discount: res.discount as number } : null;
      setApplied(next);
      onChange(next);
      if (res.needsEmail) setAskEmail(true);
      if (res.valid && personalEmail.trim()) onEmail?.(personalEmail.trim());
      // A personal code with no email yet: the email box below explains it
      if (!res.valid && !(res.needsEmail && !useEmail)) setError(res.error || "That code isn't valid");
    } catch {
      setError("Couldn't check that code");
    } finally {
      setChecking(false);
    }
  };

  // Recalculate when the cart changes after a code was applied
  useEffect(() => {
    if (applied) check(applied.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  const remove = () => {
    setApplied(null);
    setCode("");
    setError(null);
    setAskEmail(false);
    onChange(null);
  };

  return (
    <div className="space-y-1.5">
      {applied ? (
        <div className="flex items-center justify-between text-sm bg-emerald-50 text-emerald-800 rounded-xl px-3.5 py-2.5">
          <span>
            <span className="font-mono font-semibold">{applied.code}</span>: −{formatPrice(applied.discount)}
          </span>
          <button type="button" onClick={remove} className="text-xs underline">
            {text("remove")}
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={text("discount.placeholder")}
              className="flex-1 min-w-0 text-sm px-3.5 py-2.5 border border-stone-200 rounded-xl font-mono focus:outline-none focus:border-amber-600"
            />
            <button
              type="button"
              disabled={!code.trim() || checking || subtotal <= 0 || (askEmail && !personalEmail.trim())}
              onClick={() => check(code)}
              className="px-4 text-sm font-semibold rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              {checking ? "…" : text("apply")}
            </button>
          </div>
          {askEmail && (
            <label className="block">
              <span className="block text-xs text-[#735D54] mb-1">{text("discount.emailPrompt")}</span>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={personalEmail}
                onChange={(e) => setPersonalEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && code.trim() && personalEmail.trim()) {
                    e.preventDefault();
                    check(code);
                  }
                }}
                className="w-full text-sm px-3.5 py-2.5 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-600"
              />
            </label>
          )}
        </>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
