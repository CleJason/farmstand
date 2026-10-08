"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { formatDate, formatPrice } from "@/lib/utils";
import CheckoutModal from "@/components/CheckoutModal";
import { useSite } from "@/components/SiteProvider";
import DiscountInput, { type AppliedDiscount } from "@/components/DiscountInput";
import GiftCardInput, { type AppliedGift } from "@/components/GiftCardInput";

interface DropDetails {
  id: string;
  title: string;
  description: string | null;
  orderOpenAt: string;
  orderCloseAt: string;
  status: string;
  pickupSlots: {
    id: string;
    label: string;
    pickupDate: string;
    location: string | null;
    times: { time: string; full: boolean }[];
  }[];
  dropProducts: {
    id: string;
    quantityLimit: number | null;
    quantitySold: number;
    priceOverride: number | null;
    product: {
      id: string;
      name: string;
      description: string | null;
      price: number;
      imageUrl: string | null;
    };
  }[];
}

export default function DropDetailPage() {
  const site = useSite();
  const params = useParams();
  const id = params?.id as string;

  const [drop, setDrop] = useState<DropDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<{ [dropProductId: string]: number }>({});
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [discount, setDiscount] = useState<AppliedDiscount>(null);
  const [gift, setGift] = useState<AppliedGift>(null);
  const [notes, setNotes] = useState("");
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
  const [pickupInfo, setPickupInfo] = useState<{ paid: boolean; address?: string | null } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [dropRes, settingsRes] = await Promise.all([
          fetch(`/api/drops/${id}`),
          fetch("/api/settings/public"),
        ]);
        const dropData = await dropRes.json();
        const settingsData = await settingsRes.json();

        setDrop(dropData);
        if (dropData.pickupSlots?.length === 1) {
          selectSlot(dropData.pickupSlots[0]);
        }

        setPaymentSettings(settingsData);
        if (!settingsData.hasStripe) {
          if (settingsData.venmoUsername) setPaymentMethod("VENMO");
          else if (settingsData.paypalUsername) setPaymentMethod("PAYPAL");
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    if (id) load();
  }, [id]);

  // Picking a day clears the time, unless the window only has one time
  function selectSlot(slot: DropDetails["pickupSlots"][number]) {
    setSelectedSlotId(slot.id);
    const open = slot.times.filter((t) => !t.full);
    setSelectedTime(slot.times.length === 1 && open.length === 1 ? open[0].time : "");
  }

  const selectedSlot = drop?.pickupSlots.find((s) => s.id === selectedSlotId);

  const updateQty = (dropProductId: string, delta: number) => {
    setCart((prev) => {
      const cur = prev[dropProductId] || 0;
      const next = Math.max(0, cur + delta);
      const dp = drop?.dropProducts.find((p) => p.id === dropProductId);
      if (dp && dp.quantityLimit !== null) {
        const remaining = dp.quantityLimit - dp.quantitySold;
        if (next > remaining) return prev;
      }
      if (next === 0) {
        const copy = { ...prev };
        delete copy[dropProductId];
        return copy;
      }
      return { ...prev, [dropProductId]: next };
    });
  };

  const cartTotal = Object.entries(cart).reduce((sum, [dpId, qty]) => {
    const dp = drop?.dropProducts.find((p) => p.id === dpId);
    if (!dp) return sum;
    const price = dp.priceOverride !== null ? dp.priceOverride : dp.product.price;
    return sum + price * qty;
  }, 0);

  const totalItemsCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const handleCheckout = async () => {
    if (drop!.pickupSlots.length > 0 && (!selectedSlotId || !selectedTime)) {
      alert("Please choose a pickup day and time!");
      return;
    }
    if (!guestEmail) {
      alert("Please provide an email for order pickup confirmation!");
      return;
    }
    setSubmitting(true);
    try {
      const items = Object.entries(cart).map(([dpId, quantity]) => {
        const dp = drop!.dropProducts.find((p) => p.id === dpId)!;
        const price = dp.priceOverride !== null ? dp.priceOverride : dp.product.price;
        return {
          dropProductId: dp.id,
          quantity,
          price,
        };
      });

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "DROP",
          dropId: drop!.id,
          pickupSlotId: selectedSlotId,
          pickupTime: selectedTime,
          discountCode: discount?.code ?? null,
          giftCode: gift?.code ?? null,
          items,
          paymentMethod,
          notes,
          guestEmail,
          guestPhone: guestPhone || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order failed");

      // Fully paid by gift card: nothing more to pay
      if (data.status === "PAID") {
        setCompleted(true);
        fetch(`/api/orders/${data.orderId}/pickup`)
          .then((r) => r.json())
          .then(setPickupInfo)
          .catch(() => {});
        return;
      }

      setActiveOrder({
        orderId: data.orderId,
        clientSecret: data.clientSecret,
        total: data.total,
      });
    } catch (e: any) {
      alert(e.message || "Failed to submit order");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF6F0]">
        <div className="text-[#8A756C] font-semibold text-sm">Loading Drop Menu...</div>
      </div>
    );
  }

  if (!drop) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF6F0]">
        <div className="text-[#8A756C]">Drop not found.</div>
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
            Pre-Order Confirmed!
          </h1>
          <p className="text-[#735D54] text-sm leading-relaxed">
            Thank you! Your order and pickup time have been saved. We&apos;ll have it ready for you.
          </p>
          {pickupInfo?.paid && pickupInfo.address ? (
            <div className="text-left text-sm bg-[#FAF6F0] rounded-xl p-3 space-y-1">
              <p className="font-semibold text-[#2D1E18]">Pickup address</p>
              <p className="text-[#735D54] whitespace-pre-line">{pickupInfo.address}</p>
            </div>
          ) : (
            <p className="text-[#735D54] text-xs leading-relaxed">
              The exact pickup address will be sent with your confirmation once payment is confirmed.
            </p>
          )}
          <div className="pt-2">
            <Link
              href="/"
              className="inline-block w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl transition shadow-sm text-sm"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF6F0] pb-44 text-[#2D1E18]">
      {/* Top Banner */}
      <div className="bg-white border-b border-stone-200 py-6 px-4">
        <div className="max-w-3xl mx-auto space-y-2.5">
          <Link
            href="/"
            className="text-xs text-[#8A756C] hover:text-amber-600 flex items-center gap-1 font-medium transition"
          >
            ← Back to All Drops
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl md:text-3xl font-black text-[#2D1E18] tracking-tight">
              {drop.title}
            </h1>
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full ${
                drop.status === "OPEN"
                  ? "bg-[#EBF2EA] text-[#2E6B38] border border-[#D1E3D0]"
                  : "bg-[#FEF5E7] text-[#B86B1E] border border-[#FAD7A0]"
              }`}
            >
              {drop.status}
            </span>
          </div>
          {drop.description && (
            <p className="text-sm text-[#735D54] leading-relaxed">{drop.description}</p>
          )}
          <div className="text-xs text-[#8A756C] pt-1">
            Pre-orders close:{" "}
            <span className="font-bold text-[#2D1E18]">
              {formatDate(drop.orderCloseAt)}
            </span>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Step 1: Pickup Slot Selection */}
        <section className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-3">
          <h2 className="font-bold text-lg text-[#2D1E18]">
            1. Choose Your Pickup Time
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {drop.pickupSlots.map((slot) => {
              const isSelected = selectedSlotId === slot.id;
              const allFull = slot.times.every((t) => t.full);
              return (
                <button
                  type="button"
                  key={slot.id}
                  disabled={allFull}
                  onClick={() => selectSlot(slot)}
                  className={`p-4 rounded-xl border text-left transition duration-150 flex items-center justify-between gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSelected
                      ? "border-amber-600 bg-[#FAF6F0] text-[#2D1E18] font-bold shadow-xs"
                      : "border-stone-200 hover:border-stone-300 text-[#735D54]"
                  }`}
                >
                  <span>
                    <span className="block text-sm">{slot.label}</span>
                    {slot.location && <span className="block text-xs font-normal text-[#8A756C]">📍 {slot.location}</span>}
                    {allFull && <span className="block text-xs font-normal">Fully booked</span>}
                  </span>
                  {isSelected && <span className="text-amber-600">✓</span>}
                </button>
              );
            })}
          </div>

          {selectedSlot && selectedSlot.times.length > 1 && (
            <div className="space-y-2 pt-2">
              <p className="text-sm font-semibold text-[#2D1E18]">Pick a time</p>
              <div className="flex flex-wrap gap-2">
                {selectedSlot.times.map((t) => {
                  const isChosen = selectedTime === t.time;
                  return (
                    <button
                      type="button"
                      key={t.time}
                      disabled={t.full}
                      onClick={() => setSelectedTime(t.time)}
                      title={t.full ? "Full" : undefined}
                      className={`px-3 py-2 rounded-lg border text-sm transition duration-150 disabled:opacity-40 disabled:line-through disabled:cursor-not-allowed ${
                        isChosen
                          ? "border-amber-600 bg-amber-600 text-white font-semibold"
                          : "border-stone-200 hover:border-stone-300 text-[#2D1E18]"
                      }`}
                    >
                      {new Date(t.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Step 2: Food Menu */}
        <section className="space-y-4">
          <h2 className="font-bold text-lg text-[#2D1E18]">
            2. Choose Your Items
          </h2>
          <div className="grid gap-4">
            {drop.dropProducts.map((dp) => {
              const qty = cart[dp.id] || 0;
              const price =
                dp.priceOverride !== null ? dp.priceOverride : dp.product.price;
              const remaining =
                dp.quantityLimit !== null
                  ? dp.quantityLimit - dp.quantitySold
                  : null;
              const isSoldOut = remaining !== null && remaining <= 0;

              return (
                <div
                  key={dp.id}
                  className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm flex items-center gap-4 hover:border-[#E8DFD5] transition duration-150"
                >
                  {dp.product.imageUrl ? (
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-[#FAF6F0]">
                      <Image
                        src={dp.product.imageUrl}
                        alt={dp.product.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-[#FAF6F0] text-amber-600 flex items-center justify-center shrink-0 font-bold text-2xl border border-[#E8DFD5]">
                      🛍️
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[#2D1E18] truncate text-base">
                      {dp.product.name}
                    </h3>
                    {dp.product.description && (
                      <p className="text-xs text-[#735D54] line-clamp-2 mt-0.5 leading-relaxed">
                        {dp.product.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="font-extrabold text-amber-600 text-sm">
                        {formatPrice(price)}
                      </span>
                      {remaining !== null && (
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            isSoldOut
                              ? "bg-red-50 text-red-600 border border-red-100"
                              : "bg-[#FAF6F0] text-[#735D54] border border-[#E8DFD5]"
                          }`}
                        >
                          {isSoldOut ? "Sold out" : `${remaining} left`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      disabled={qty === 0 || isSoldOut}
                      onClick={() => updateQty(dp.id, -1)}
                      className="w-8 h-8 rounded-lg border border-stone-200 font-bold text-[#2D1E18] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center hover:bg-stone-50 transition"
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-bold text-sm text-[#2D1E18]">
                      {qty}
                    </span>
                    <button
                      disabled={
                        (remaining !== null && qty >= remaining) || isSoldOut
                      }
                      onClick={() => updateQty(dp.id, 1)}
                      className="w-8 h-8 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition shadow-xs"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Step 3: Contact & Payment Info */}
        {totalItemsCount > 0 && (
          <section className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-4">
            <h2 className="font-bold text-lg text-[#2D1E18]">
              3. Pickup &amp; Payment Details
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#2D1E18] mb-1">
                  Email Address * (for confirmation)
                </label>
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  className="w-full text-sm px-3.5 py-2.5 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#2D1E18] mb-1">
                  Phone (optional for SMS pickup reminder)
                </label>
                <input
                  type="tel"
                  placeholder="(555) 000-0000"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  className="w-full text-sm px-3.5 py-2.5 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#2D1E18] mb-1">
                Special Notes / Requests
              </label>
              <input
                type="text"
                placeholder="Anything we should know?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full text-sm px-3.5 py-2.5 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#2D1E18] mb-1">Discount Code</label>
              <DiscountInput type="DROP" subtotal={cartTotal} onChange={setDiscount} />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#2D1E18] mb-1">Gift Card</label>
              <GiftCardInput amountDue={cartTotal - (discount?.discount ?? 0)} onChange={setGift} />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#2D1E18] mb-2">
                Select Payment Method
              </label>
              <div className="flex gap-2">
                {paymentSettings.hasStripe && (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("STRIPE")}
                    className={`flex-1 py-3 text-xs font-bold rounded-xl border transition ${
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
                    className={`flex-1 py-3 text-xs font-bold rounded-xl border transition ${
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
                    className={`flex-1 py-3 text-xs font-bold rounded-xl border transition ${
                      paymentMethod === "PAYPAL"
                        ? "bg-[#0070BA] text-white border-[#0070BA]"
                        : "bg-[#FAF6F0] text-[#735D54] border-[#E8DFD5]"
                    }`}
                  >
                    PayPal
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Floating Checkout Bar */}
      {totalItemsCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-stone-200 p-4 shadow-2xl z-40 max-w-3xl mx-auto rounded-t-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs text-[#735D54]">
                {totalItemsCount} {totalItemsCount === 1 ? "item" : "items"} selected
              </div>
              <div className="text-xl font-black text-[#2D1E18]">
                {(discount || gift) && (
                  <span className="text-sm font-medium text-stone-400 line-through mr-2">{formatPrice(cartTotal)}</span>
                )}
                {formatPrice(cartTotal - (discount?.discount ?? 0) - (gift?.amount ?? 0))}
              </div>
            </div>
            <button
              onClick={handleCheckout}
              disabled={submitting}
              className="bg-amber-600 hover:bg-amber-700 text-white font-black px-8 py-3.5 rounded-xl shadow-sm transition disabled:opacity-50 text-sm"
            >
              {submitting ? "Submitting..." : "Proceed to Checkout →"}
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
            const orderId = activeOrder.orderId;
            setCompleted(true);
            setActiveOrder(null);
            // Card payments are confirmed by Stripe a moment later; ask twice
            const fetchPickup = () =>
              fetch(`/api/orders/${orderId}/pickup`)
                .then((r) => r.json())
                .then((info) => {
                  setPickupInfo(info);
                  return info;
                })
                .catch(() => null);
            fetchPickup().then((info) => {
              if (!info?.paid) setTimeout(fetchPickup, 4000);
            });
          }}
          onClose={() => setActiveOrder(null)}
        />
      )}
    </div>
  );
}
