"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { formatPrice, paypalMeUrl, venmoUrl } from "@/lib/utils";
import { useText } from "@/components/SiteProvider";

interface CheckoutModalProps {
  orderId: string;
  clientSecret: string | null;
  stripePublishableKey?: string;
  paymentMethod: "STRIPE" | "PAYPAL" | "VENMO";
  total: number;
  paypalUsername?: string;
  venmoUsername?: string;
  onSuccess: () => void;
  onClose: () => void;
}

function StripeCheckoutForm({
  orderId,
  total,
  onSuccess,
}: {
  orderId: string;
  total: number;
  onSuccess: () => void;
}) {
  const text = useText();
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // The card form comes from Stripe's servers; blockers and some in-app browsers stop it loading
  const [ready, setReady] = useState(false);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setStuck(true), 10000);
    return () => clearTimeout(t);
  }, [ready]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setErrorMessage(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    if (error) {
      setErrorMessage(error.message || "An error occurred with your payment.");
      setLoading(false);
    } else {
      // Have the shop confirm with Stripe now, so the order and receipt don't wait on the webhook
      if (paymentIntent?.status === "succeeded") {
        await fetch(`/api/orders/${orderId}/card-paid`, { method: "POST" }).catch(() => {});
      }
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        onReady={() => {
          setReady(true);
          setStuck(false);
        }}
        onLoadError={(e) => {
          console.error("Stripe card form failed to load", e.error);
          setStuck(true);
        }}
      />
      {!ready && !stuck && <p className="text-sm text-stone-500 text-center py-6">{text("checkout.cardLoading")}</p>}
      {stuck && !ready && (
        <div className="p-3 bg-amber-50 text-amber-900 text-sm rounded-lg border border-amber-200">
          {text("checkout.cardTrouble")}
        </div>
      )}
      {errorMessage && (
        <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
          {errorMessage}
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || !ready || loading}
        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50"
      >
        {loading ? text("checkout.processing") : text("checkout.payCard", { total: formatPrice(total) })}
      </button>
    </form>
  );
}

export default function CheckoutModal({
  orderId,
  clientSecret,
  stripePublishableKey,
  paymentMethod,
  total,
  paypalUsername,
  venmoUsername,
  onSuccess,
  onClose,
}: CheckoutModalProps) {
  const text = useText();
  const order = orderId.slice(-6).toUpperCase();
  const vars = { total: formatPrice(total), order, handle: venmoUsername ?? "" };
  // Load Stripe once, not on every render (re-loading resets the card form)
  const stripePromise = useMemo(
    () =>
      stripePublishableKey
        ? loadStripe(stripePublishableKey).catch((err) => {
            // Stripe's script was blocked or didn't download; the form shows what to do
            console.error("Couldn't load Stripe", err);
            return null;
          })
        : null,
    [stripePublishableKey]
  );

  return (
    // Scrolls as a whole, so the card form fits even on short phone screens
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm overflow-y-auto overscroll-contain">
      <div className="min-h-full flex items-start sm:items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl relative my-2">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold"
        >
          ✕
        </button>

        <h2 className="text-xl font-bold text-gray-900 mb-2">{text("checkout.title")}</h2>
        <p className="text-sm text-gray-500 mb-6">{text("checkout.orderLine", vars)}</p>

        {paymentMethod === "STRIPE" && clientSecret && stripePromise ? (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret, appearance: { theme: "stripe" } }}
          >
            <StripeCheckoutForm orderId={orderId} total={total} onSuccess={onSuccess} />
          </Elements>
        ) : paymentMethod === "PAYPAL" ? (
          <div className="space-y-4 text-center">
            <div className="p-4 bg-sky-50 rounded-xl border border-sky-100 text-sky-900 text-sm">
              {text("checkout.paypalText", vars)}
            </div>
            <a
              href={paypalMeUrl(paypalUsername, total)}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-[#0070BA] hover:bg-[#003087] text-white font-medium py-3 rounded-xl transition"
            >
              {text("checkout.paypalButton", vars)}
            </a>
            <button
              onClick={onSuccess}
              className="w-full border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2.5 rounded-xl transition text-sm"
            >
              {text("checkout.sent")}
            </button>
          </div>
        ) : paymentMethod === "VENMO" ? (
          <div className="space-y-4 text-center">
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 text-blue-900 text-sm">
              {text("checkout.venmoText", vars)}
            </div>
            <a
              href={venmoUrl(venmoUsername, total, `Order #${orderId.slice(-6)}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-[#008CFF] hover:bg-[#0070CC] text-white font-medium py-3 rounded-xl transition"
            >
              {text("checkout.venmoButton", vars)}
            </a>
            <button
              onClick={onSuccess}
              className="w-full border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2.5 rounded-xl transition text-sm"
            >
              {text("checkout.sent")}
            </button>
          </div>
        ) : (
          <div className="p-3 bg-amber-50 text-amber-900 text-sm rounded-lg border border-amber-200">
            {text("checkout.cardTrouble")}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
