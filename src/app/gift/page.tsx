"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CheckoutModal from "@/components/CheckoutModal";
import { StoreHeader } from "@/components/StoreChrome";
import LegalFooter from "@/components/LegalFooter";
import SpamHint from "@/components/SpamHint";
import { useSite } from "@/components/SiteProvider";
import { formatPrice } from "@/lib/utils";

const PRESETS = [2500, 5000, 7500, 10000];

type PaymentSettings = {
  hasStripe: boolean;
  stripePublishableKey: string;
  paypalUsername: string;
  venmoUsername: string;
};

const inputClass =
  "w-full text-sm px-3.5 py-2.5 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-600";

export default function GiftCardPage() {
  const site = useSite();
  const [amount, setAmount] = useState<number>(5000);
  const [custom, setCustom] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [message, setMessage] = useState("");
  const [purchaserEmail, setPurchaserEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"STRIPE" | "VENMO" | "PAYPAL">("STRIPE");
  const [payments, setPayments] = useState<PaymentSettings | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<{ orderId: string; clientSecret: string | null; total: number } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/settings/public")
      .then((r) => r.json())
      .then((s: PaymentSettings) => {
        setPayments(s);
        if (!s.hasStripe) setPaymentMethod(s.venmoUsername ? "VENMO" : "PAYPAL");
      })
      .catch(() => {});
  }, []);

  const finalAmount = custom ? Math.round(Number(custom) * 100) : amount;

  const buy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/gift-cards/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: finalAmount,
          recipientName,
          recipientEmail,
          fromName,
          message,
          purchaserEmail,
          paymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't start the purchase");
      setActiveOrder({ orderId: data.orderId, clientSecret: data.clientSecret, total: data.total });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the purchase");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-white">
        <StoreHeader />
        <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
          <div className="text-5xl">🎁</div>
          <h1 className="text-2xl font-bold text-stone-900">Thank you!</h1>
          <p className="text-sm text-stone-600">
            {paymentMethod === "STRIPE"
              ? "Your gift card is paid."
              : "Once we confirm your payment, the gift card is activated."}{" "}
            The code will be emailed to {recipientEmail ? "the recipient" : "you"}
            {recipientEmail ? " and a receipt to you" : ""}.
          </p>
          <SpamHint />
          <Link href="/" className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-2.5 rounded-full text-sm">
            Back to {site.SITE_NAME}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <StoreHeader />
      <main className="max-w-lg mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <div className="text-4xl">🎁</div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight mt-2">Gift Cards</h1>
          <p className="text-sm text-stone-500 mt-2">
            Give someone a treat from {site.SITE_NAME}. They can use it on pre-orders or at {site.SITE_FARMSTAND_HEADING}.
          </p>
        </div>

        <form onSubmit={buy} className="space-y-5">
          <div>
            <span className="block text-xs font-bold text-stone-900 mb-2">Amount</span>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => {
                    setAmount(p);
                    setCustom("");
                  }}
                  className={`py-2.5 rounded-xl border text-sm font-semibold ${
                    !custom && amount === p ? "bg-amber-600 text-white border-amber-600" : "border-stone-200 text-stone-700"
                  }`}
                >
                  {formatPrice(p).replace(".00", "")}
                </button>
              ))}
            </div>
            <input
              type="number"
              min="5"
              max="500"
              step="1"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Or another amount ($5–$500)"
              className={`${inputClass} mt-2`}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-bold text-stone-900 mb-1">Recipient&apos;s name</span>
              <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-stone-900 mb-1">Recipient&apos;s email</span>
              <input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="We'll email them the code" className={inputClass} />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-bold text-stone-900 mb-1">From</span>
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your name" className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-stone-900 mb-1">Message (optional)</span>
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-stone-900 mb-1">Your email * (for the receipt)</span>
            <input type="email" required value={purchaserEmail} onChange={(e) => setPurchaserEmail(e.target.value)} className={inputClass} />
          </label>

          {payments && (
            <div>
              <span className="block text-xs font-bold text-stone-900 mb-2">Pay with</span>
              <div className="flex gap-2">
                {payments.hasStripe && (
                  <button type="button" onClick={() => setPaymentMethod("STRIPE")} className={`flex-1 py-3 text-xs font-bold rounded-xl border ${paymentMethod === "STRIPE" ? "bg-amber-600 text-white border-amber-600" : "border-stone-200 text-stone-600"}`}>
                    💳 Card
                  </button>
                )}
                {payments.venmoUsername && (
                  <button type="button" onClick={() => setPaymentMethod("VENMO")} className={`flex-1 py-3 text-xs font-bold rounded-xl border ${paymentMethod === "VENMO" ? "bg-[#008CFF] text-white border-[#008CFF]" : "border-stone-200 text-stone-600"}`}>
                    Venmo
                  </button>
                )}
                {payments.paypalUsername && (
                  <button type="button" onClick={() => setPaymentMethod("PAYPAL")} className={`flex-1 py-3 text-xs font-bold rounded-xl border ${paymentMethod === "PAYPAL" ? "bg-[#0070BA] text-white border-[#0070BA]" : "border-stone-200 text-stone-600"}`}>
                    PayPal
                  </button>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-[11px] text-stone-400 text-center">
            By buying you agree to our <Link href="/terms" className="underline">Terms</Link> and{" "}
            <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
          <button
            type="submit"
            disabled={submitting || !finalAmount}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3.5 rounded-xl disabled:opacity-50"
          >
            {submitting ? "One moment..." : `Buy ${formatPrice(finalAmount || 0)} gift card`}
          </button>
        </form>
      </main>
      <LegalFooter />

      {activeOrder && payments && (
        <CheckoutModal
          orderId={activeOrder.orderId}
          clientSecret={activeOrder.clientSecret}
          stripePublishableKey={payments.stripePublishableKey}
          paymentMethod={paymentMethod}
          total={activeOrder.total}
          paypalUsername={payments.paypalUsername}
          venmoUsername={payments.venmoUsername}
          onSuccess={() => {
            setActiveOrder(null);
            setDone(true);
          }}
          onClose={() => setActiveOrder(null)}
        />
      )}
    </div>
  );
}
