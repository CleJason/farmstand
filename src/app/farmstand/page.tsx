"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { formatPrice } from "@/lib/utils";
import CheckoutModal from "@/components/CheckoutModal";
import { useSite } from "@/components/SiteProvider";
import DiscountInput, { type AppliedDiscount } from "@/components/DiscountInput";
import GiftCardInput, { type AppliedGift } from "@/components/GiftCardInput";
import LegalFooter from "@/components/LegalFooter";
import Link from "next/link";

interface FarmstandItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  imagePosition: string | null;
  available: boolean;
  quantityAvailable: number;
  quantitySold: number;
}

export default function FarmstandKioskPage() {
  const site = useSite();
  const [discount, setDiscount] = useState<AppliedDiscount>(null);
  const [gift, setGift] = useState<AppliedGift>(null);
  const [items, setItems] = useState<FarmstandItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<{ [id: string]: number }>({});
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"STRIPE" | "PAYPAL" | "VENMO">("STRIPE");

  const [paymentSettings, setPaymentSettings] = useState<{
    hasStripe: boolean;
    stripePublishableKey: string;
    paypalUsername: string;
    venmoUsername: string;
  }>({
    hasStripe: false,
    stripePublishableKey: "",
    paypalUsername: "",
    venmoUsername: "",
  });

  const [activeOrder, setActiveOrder] = useState<{
    orderId: string;
    clientSecret: string | null;
    total: number;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [itemsRes, settingsRes] = await Promise.all([
          fetch("/api/farmstand"),
          fetch("/api/settings/public"),
        ]);
        const itemsData = await itemsRes.json();
        const settingsData = await settingsRes.json();

        setItems(itemsData.filter((i: FarmstandItem) => i.available));
        setPaymentSettings(settingsData);
        if (!settingsData.hasStripe) {
          if (settingsData.venmoUsername) setPaymentMethod("VENMO");
          else if (settingsData.paypalUsername) setPaymentMethod("PAYPAL");
        }
      } catch (err) {
        console.error("Failed to load kiosk items", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      const item = items.find((i) => i.id === id);
      const remaining = (item?.quantityAvailable || 0) - (item?.quantitySold || 0);
      if (next > remaining) return prev;
      if (next === 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: next };
    });
  };

  const cartTotal = Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = items.find((i) => i.id === id);
    return sum + (item ? item.price * qty : 0);
  }, 0);

  const totalItemsCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const handleCheckout = async () => {
    if (cartTotal === 0) return;
    setSubmitting(true);
    try {
      const orderItems = Object.entries(cart).map(([id, quantity]) => {
        const item = items.find((i) => i.id === id)!;
        return {
          farmstandItemId: id,
          quantity,
          price: item.price,
        };
      });

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "FARMSTAND",
          items: orderItems,
          discountCode: discount?.code ?? null,
          giftCode: gift?.code ?? null,
          paymentMethod,
          guestEmail: guestEmail || null,
          guestPhone: guestPhone || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create order");

      // Fully paid by gift card: nothing more to pay
      if (data.status === "PAID") {
        setCompleted(true);
        return;
      }

      setActiveOrder({
        orderId: data.orderId,
        clientSecret: data.clientSecret,
        total: data.total,
      });
    } catch (e: any) {
      alert(e.message || "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF6F0]">
        <div className="text-[#8A756C] font-semibold text-sm">Loading...</div>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-6 text-center">
        <div className="max-w-md bg-white p-8 rounded-2xl shadow-sm border border-stone-200 space-y-4">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto text-3xl font-bold">
            ✓
          </div>
          <h1 className="text-2xl font-black text-[#2D1E18]">
            Thank you for supporting {site.SITE_NAME}!
          </h1>
          <p className="text-sm text-[#735D54] leading-relaxed">
            Your order was received. Enjoy!
          </p>
          <button
            onClick={() => {
              setCart({});
              setActiveOrder(null);
              setCompleted(false);
            }}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl transition duration-150 shadow-sm"
          >
            Start New Purchase
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-[#2D1E18] pb-40">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30 px-4 py-4 text-center shadow-xs">
        <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">
          {site.SITE_NAME}
        </span>
        <h1 className="text-2xl font-black tracking-tight text-[#2D1E18] mt-0.5">
          {site.SITE_FARMSTAND_HEADING}
        </h1>
        <p className="text-xs text-[#735D54] mt-0.5">
          {site.SITE_FARMSTAND_BLURB}
        </p>
      </header>

      {/* Item List */}
      <main className="max-w-xl mx-auto p-4 space-y-4 pt-6">
        {items.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 border border-stone-200 text-center space-y-2">
            <div className="text-3xl">🛍️</div>
            <p className="text-stone-600 font-semibold">No extras out right now.</p>
            <p className="text-xs text-stone-400 whitespace-pre-line">
              Check back soon!
            </p>
          </div>
        ) : (
          items.map((item) => {
            const qty = cart[item.id] || 0;
            const remaining = item.quantityAvailable - item.quantitySold;
            const isSoldOut = remaining <= 0;

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-4 shadow-sm border border-stone-200 flex gap-4 items-center hover:border-[#E8DFD5] transition duration-150"
              >
                {item.imageUrl ? (
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-[#FAF6F0]">
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      fill
                      className="object-cover"
                      style={{ objectPosition: item.imagePosition || undefined }}
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-[#FAF6F0] text-amber-600 flex items-center justify-center shrink-0 font-bold text-2xl border border-[#E8DFD5]">
                    🛍️
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-[#2D1E18] text-base truncate">
                    {item.name}
                  </h3>
                  {item.description && (
                    <p className="text-xs text-[#735D54] line-clamp-2 mt-0.5 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="font-extrabold text-amber-600 text-sm">
                      {formatPrice(item.price)}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        isSoldOut
                          ? "bg-red-50 text-red-600 border border-red-100"
                          : "bg-[#FAF6F0] text-[#735D54] border border-[#E8DFD5]"
                      }`}
                    >
                      {isSoldOut ? "Sold out" : `${remaining} available`}
                    </span>
                  </div>
                </div>

                {/* Stepper */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    disabled={qty === 0 || isSoldOut}
                    onClick={() => updateQuantity(item.id, -1)}
                    className="w-8 h-8 rounded-lg border border-stone-200 font-bold text-[#2D1E18] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center hover:bg-stone-50 transition"
                  >
                    -
                  </button>
                  <span className="w-6 text-center font-bold text-sm text-[#2D1E18]">
                    {qty}
                  </span>
                  <button
                    disabled={qty >= remaining || isSoldOut}
                    onClick={() => updateQuantity(item.id, 1)}
                    className="w-8 h-8 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition shadow-xs"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })
        )}
      </main>

      <LegalFooter />

      {/* Floating Bottom Drawer */}
      {totalItemsCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-stone-200 p-4 shadow-xl z-40 max-w-xl mx-auto rounded-t-2xl">
          <div className="space-y-3">
            {/* Payment Method Selector */}
            <div className="flex gap-2">
              {paymentSettings.hasStripe && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("STRIPE")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${
                    paymentMethod === "STRIPE"
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-[#FAF6F0] text-[#735D54] border-[#E8DFD5]"
                  }`}
                >
                  💳 Card / Apple Pay
                </button>
              )}
              {paymentSettings.venmoUsername && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("VENMO")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${
                    paymentMethod === "VENMO"
                      ? "bg-[#008CFF] text-white border-[#008CFF]"
                      : "bg-[#FAF6F0] text-[#735D54] border-[#E8DFD5]"
                  }`}
                >
                  Venmo
                </button>
              )}
              {paymentSettings.paypalUsername && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("PAYPAL")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${
                    paymentMethod === "PAYPAL"
                      ? "bg-[#0070BA] text-white border-[#0070BA]"
                      : "bg-[#FAF6F0] text-[#735D54] border-[#E8DFD5]"
                  }`}
                >
                  PayPal
                </button>
              )}
            </div>

            {/* Optional contact info for receipts */}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="email"
                placeholder="Email for receipt (optional)"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-600"
              />
              <input
                type="tel"
                placeholder="Phone for SMS receipt (optional)"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-600"
              />
            </div>

            <DiscountInput type="FARMSTAND" subtotal={cartTotal} onChange={setDiscount} />
            <GiftCardInput amountDue={cartTotal - (discount?.discount ?? 0)} onChange={setGift} />

            <p className="text-[10px] text-stone-400 leading-snug">
              Adding a phone means you agree to a text receipt (msg &amp; data rates may apply; reply STOP to opt out).
              By paying you agree to our{" "}
              <Link href="/terms" className="underline">Terms</Link> and{" "}
              <Link href="/privacy" className="underline">Privacy Policy</Link>.
            </p>

            {/* Action Button */}
            <button
              onClick={handleCheckout}
              disabled={submitting}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black py-3.5 rounded-xl shadow-sm transition flex items-center justify-between px-6 disabled:opacity-50"
            >
              <span>
                Pay for {totalItemsCount} {totalItemsCount === 1 ? "item" : "items"}
              </span>
              <span>{formatPrice(cartTotal - (discount?.discount ?? 0) - (gift?.amount ?? 0))} →</span>
            </button>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {activeOrder && (
        <CheckoutModal
          orderId={activeOrder.orderId}
          clientSecret={activeOrder.clientSecret}
          stripePublishableKey={paymentSettings.stripePublishableKey}
          paymentMethod={paymentMethod}
          total={activeOrder.total}
          paypalUsername={paymentSettings.paypalUsername}
          venmoUsername={paymentSettings.venmoUsername}
          onSuccess={() => {
            setCompleted(true);
            setActiveOrder(null);
          }}
          onClose={() => setActiveOrder(null)}
        />
      )}
    </div>
  );
}
