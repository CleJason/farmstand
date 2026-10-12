"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { formatDate, formatPrice } from "@/lib/utils";
import CheckoutModal from "@/components/CheckoutModal";
import ContactDetailsModal, { type ContactDetails } from "@/components/ContactDetailsModal";
import { useText, useViewer } from "@/components/SiteProvider";
import DiscountInput, { type AppliedDiscount } from "@/components/DiscountInput";
import GiftCardInput, { type AppliedGift } from "@/components/GiftCardInput";
import LegalFooter from "@/components/LegalFooter";
import BoxBuilder from "@/components/BoxBuilder";
import AddOnPicker from "@/components/AddOnPicker";
import ProductDetails from "@/components/ProductDetails";
import { addOnsKey, productAddOns } from "@/lib/addons";
import SpamHint from "@/components/SpamHint";
import { type BoxPick, describePicks, dropBoxOptions, isBox, picksKey } from "@/lib/box";

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
    boxOptions: string[];
    product: {
      id: string;
      name: string;
      description: string | null;
      price: number;
      imageUrl: string | null;
      imagePosition: string | null;
      addOns: unknown;
      boxSize: number | null;
      boxOptions: string[];
    };
  }[];
}

// One cart line: a product, or one filled mix & match box (same picks share a line)
type CartLine = { key: string; dropProductId: string; quantity: number; selections?: BoxPick[]; addOns?: string[] };

export default function DropDetailPage() {
  const text = useText();
  const viewer = useViewer();
  const params = useParams();
  const id = params?.id as string;

  const [drop, setDrop] = useState<DropDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [buildingBoxFor, setBuildingBoxFor] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [discount, setDiscount] = useState<AppliedDiscount>(null);
  const [gift, setGift] = useState<AppliedGift>(null);
  // Who the order is for: asked in the first checkout step
  const [details, setDetails] = useState<ContactDetails>({
    name: "",
    email: viewer?.email ?? "",
    phone: "",
    notes: "",
  });
  const [showDetails, setShowDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
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

        setDrop(dropRes.ok ? dropData : null);
        if (dropRes.ok && dropData.pickupSlots?.length === 1) {
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

  // How many of a product are in the cart, across all of its boxes
  const qtyInCart = (dropProductId: string) =>
    cart.filter((l) => l.dropProductId === dropProductId).reduce((a, l) => a + l.quantity, 0);

  const canAdd = (dropProductId: string) => {
    const dp = drop?.dropProducts.find((p) => p.id === dropProductId);
    return !dp || dp.quantityLimit === null || qtyInCart(dropProductId) < dp.quantityLimit - dp.quantitySold;
  };

  /** Change a cart line by delta; creates it when adding a new product/box. */
  const updateLine = (dropProductId: string, delta: number, selections?: BoxPick[], addOns?: string[]) => {
    const key = `${dropProductId}#${picksKey(selections)}#${addOnsKey(addOns)}`;
    if (delta > 0 && !canAdd(dropProductId)) return;
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (!existing) {
        return delta > 0 ? [...prev, { key, dropProductId, quantity: delta, selections, addOns }] : prev;
      }
      const quantity = existing.quantity + delta;
      return quantity <= 0
        ? prev.filter((l) => l.key !== key)
        : prev.map((l) => (l.key === key ? { ...l, quantity } : l));
    });
  };

  const priceOf = (dp: DropDetails["dropProducts"][number]) =>
    dp.priceOverride !== null ? dp.priceOverride : dp.product.price;

  // Price of one item on a line: the product plus any add-ons chosen
  const unitPrice = (dp: DropDetails["dropProducts"][number], addOns?: string[]) =>
    priceOf(dp) + productAddOns(dp.product.addOns).filter((a) => addOns?.includes(a.name)).reduce((s, a) => s + a.price, 0);

  const cartTotal = cart.reduce((sum, l) => {
    const dp = drop?.dropProducts.find((p) => p.id === l.dropProductId);
    return dp ? sum + unitPrice(dp, l.addOns) * l.quantity : sum;
  }, 0);
  const [addingTo, setAddingTo] = useState<string | null>(null); // product with add-ons being added
  const [detailsFor, setDetailsFor] = useState<string | null>(null); // product whose full description is open
  const addOnProduct = drop?.dropProducts.find((p) => p.id === addingTo);

  const totalItemsCount = cart.reduce((a, l) => a + l.quantity, 0);
  const boxProduct = drop?.dropProducts.find((p) => p.id === buildingBoxFor);

  // "Proceed to Checkout": pickup time first, then the details step
  const startCheckout = () => {
    if (drop!.pickupSlots.length > 0 && (!selectedSlotId || !selectedTime)) {
      alert(text("drop.needPickup"));
      return;
    }
    setDetailsError(null);
    setShowDetails(true);
  };

  const placeOrder = async () => {
    if (!details.name.trim()) {
      setDetailsError(text("checkout.needName"));
      return;
    }
    if (!details.email.trim()) {
      setDetailsError(text("checkout.needEmail"));
      return;
    }
    setDetailsError(null);
    setSubmitting(true);
    try {
      const items = cart.map((l) => ({
        dropProductId: l.dropProductId,
        quantity: l.quantity,
        selections: l.selections ?? null,
        addOns: l.addOns ?? [],
      }));

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
          notes: details.notes,
          guestName: details.name.trim(),
          guestEmail: details.email.trim(),
          guestPhone: details.phone || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order failed");
      setShowDetails(false);

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
    } catch (e) {
      setDetailsError((e instanceof Error && e.message) || "Failed to submit order");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF6F0]">
        <div className="text-[#8A756C] font-semibold text-sm">{text("drop.loading")}</div>
      </div>
    );
  }

  if (!drop) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF6F0]">
        <div className="text-[#8A756C]">{text("drop.notFound")}</div>
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
          <h1 className="text-2xl font-black text-[#2D1E18]">{text("drop.doneTitle")}</h1>
          <p className="text-[#735D54] text-sm leading-relaxed">{text("drop.doneText")}</p>
          {pickupInfo?.paid && pickupInfo.address ? (
            <div className="text-left text-sm bg-[#FAF6F0] rounded-xl p-3 space-y-1">
              <p className="font-semibold text-[#2D1E18]">{text("drop.addressTitle")}</p>
              <p className="text-[#735D54] whitespace-pre-line">{pickupInfo.address}</p>
            </div>
          ) : (
            <p className="text-sm text-[#2D1E18] bg-[#FAF6F0] rounded-xl p-3 leading-relaxed">
              {text("drop.addressNote")}
            </p>
          )}
          <SpamHint />
          <div className="pt-2">
            <Link
              href="/"
              className="inline-block w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl transition shadow-sm text-sm"
            >
              {text("drop.backHome")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Published drops can be browsed before they open; ordering only works while open
  const now = new Date();
  const phase =
    drop.status === "DRAFT"
      ? "draft"
      : drop.status !== "OPEN" || now > new Date(drop.orderCloseAt)
        ? "closed"
        : now < new Date(drop.orderOpenAt)
          ? "soon"
          : "open";
  const canOrder = phase === "open";
  const detailProduct = drop.dropProducts.find((p) => p.id === detailsFor);

  return (
    <div className="min-h-screen bg-[#FAF6F0] pb-44 text-[#2D1E18]">
      {/* Top Banner */}
      <div className="bg-white border-b border-stone-200 py-6 px-4">
        <div className="max-w-3xl mx-auto space-y-2.5">
          <Link
            href="/"
            className="text-xs text-[#8A756C] hover:text-amber-600 flex items-center gap-1 font-medium transition"
          >
            {text("drop.back")}
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl md:text-3xl font-black text-[#2D1E18] tracking-tight">
              {drop.title}
            </h1>
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full ${
                phase === "open"
                  ? "bg-[#EBF2EA] text-[#2E6B38] border border-[#D1E3D0]"
                  : "bg-[#FEF5E7] text-[#B86B1E] border border-[#FAD7A0]"
              }`}
            >
              {phase === "open"
                ? text("home.badgeOpen")
                : phase === "soon"
                  ? text("home.badgeSoon")
                  : phase === "draft"
                    ? "Draft (only admins can see this)"
                    : text("home.badgeClosed")}
            </span>
          </div>
          {drop.description && (
            <p className="text-sm text-[#735D54] leading-relaxed">{drop.description}</p>
          )}
          <div className="text-xs text-[#8A756C] pt-1">
            {text("drop.closes")}{" "}
            <span className="font-bold text-[#2D1E18]">
              {formatDate(drop.orderCloseAt)}
            </span>
          </div>
          {(phase === "soon" || phase === "draft") && (
            <p className="text-sm font-semibold text-[#2D1E18] bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              {text("drop.opensAt", { date: formatDate(drop.orderOpenAt) })}
            </p>
          )}
          {phase === "closed" && (
            <p className="text-sm font-semibold text-[#2D1E18] bg-stone-100 rounded-xl px-3 py-2">{text("drop.closedNote")}</p>
          )}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Step 1: Pickup Slot Selection */}
        <section className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-3">
          <h2 className="font-bold text-lg text-[#2D1E18]">{text("drop.step1")}</h2>
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
                    {allFull && <span className="block text-xs font-normal">{text("drop.fullyBooked")}</span>}
                  </span>
                  {isSelected && <span className="text-amber-600">✓</span>}
                </button>
              );
            })}
          </div>

          {selectedSlot && selectedSlot.times.length > 1 && (
            <div className="space-y-2 pt-2">
              <p className="text-sm font-semibold text-[#2D1E18]">{text("drop.pickTime")}</p>
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
          <h2 className="font-bold text-lg text-[#2D1E18]">{text("drop.step2")}</h2>
          {/* grid-cols-1 (minmax 0) keeps long names/descriptions from widening the page on phones */}
          <div className="grid grid-cols-1 gap-4">
            {drop.dropProducts.map((dp) => {
              const qty = qtyInCart(dp.id);
              const price = priceOf(dp);
              const remaining =
                dp.quantityLimit !== null
                  ? dp.quantityLimit - dp.quantitySold
                  : null;
              const isSoldOut = remaining !== null && remaining <= 0;
              const box = isBox(dp.product);
              const extras = productAddOns(dp.product.addOns);
              // Boxes and products with add-ons list each different choice as its own line
              const boxLines = box || extras.length > 0 ? cart.filter((l) => l.dropProductId === dp.id) : [];

              return (
                <div
                  key={dp.id}
                  className="min-w-0 bg-white rounded-2xl p-4 sm:p-5 border border-stone-200 shadow-sm hover:border-[#E8DFD5] transition duration-150"
                >
                <div className="flex items-center gap-3 sm:gap-4">
                  {/* Tap the photo or name for the full description */}
                  <button
                    type="button"
                    onClick={() => setDetailsFor(dp.id)}
                    className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 text-left"
                  >
                  {dp.product.imageUrl ? (
                    <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden shrink-0 bg-[#FAF6F0]">
                      <Image
                        src={dp.product.imageUrl}
                        alt={dp.product.name}
                        fill
                        className="object-cover"
                        style={{ objectPosition: dp.product.imagePosition || undefined }}
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-[#FAF6F0] text-amber-600 flex items-center justify-center shrink-0 font-bold text-2xl border border-[#E8DFD5]">
                      🛍️
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[#2D1E18] text-base leading-snug">
                      {dp.product.name}
                    </h3>
                    {dp.product.description && (
                      <p className="text-xs text-[#735D54] line-clamp-2 mt-0.5 leading-relaxed">
                        {dp.product.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span className="font-extrabold text-amber-600 text-sm">
                        {formatPrice(price)}
                      </span>
                      {box && (
                        <span className="text-[11px] font-semibold text-[#735D54]">
                          {text("drop.mixMatch", { count: dp.product.boxSize ?? "" })}
                        </span>
                      )}
                      {remaining !== null && (
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            isSoldOut
                              ? "bg-red-50 text-red-600 border border-red-100"
                              : "bg-[#FAF6F0] text-[#735D54] border border-[#E8DFD5]"
                          }`}
                        >
                          {isSoldOut ? text("drop.soldOut") : text("drop.left", { count: remaining })}
                        </span>
                      )}
                      <span className="text-[11px] font-semibold text-amber-700 underline underline-offset-2">
                        {text("drop.details")}
                      </span>
                    </div>
                  </div>
                  </button>

                  {box ? (
                    <button
                      disabled={(remaining !== null && qty >= remaining) || isSoldOut || !canOrder}
                      onClick={() => setBuildingBoxFor(dp.id)}
                      className="shrink-0 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs disabled:opacity-30 disabled:cursor-not-allowed transition shadow-xs"
                    >
                      {qty > 0 ? text("drop.anotherBox") : text("drop.buildBox")}
                    </button>
                  ) : extras.length > 0 ? (
                    <button
                      disabled={(remaining !== null && qty >= remaining) || isSoldOut || !canOrder}
                      onClick={() => setAddingTo(dp.id)}
                      className="shrink-0 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs disabled:opacity-30 disabled:cursor-not-allowed transition shadow-xs"
                    >
                      {qty > 0 ? text("drop.addMore") : text("drop.add")}
                    </button>
                  ) : (
                  /* Quantity Stepper */
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      disabled={qty === 0 || isSoldOut}
                      onClick={() => updateLine(dp.id, -1)}
                      className="w-8 h-8 rounded-lg border border-stone-200 font-bold text-[#2D1E18] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center hover:bg-stone-50 transition"
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-bold text-sm text-[#2D1E18]">
                      {qty}
                    </span>
                    <button
                      disabled={
                        (remaining !== null && qty >= remaining) || isSoldOut || !canOrder
                      }
                      onClick={() => updateLine(dp.id, 1)}
                      className="w-8 h-8 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition shadow-xs"
                    >
                      +
                    </button>
                  </div>
                  )}
                </div>

                {/* The boxes this customer has built */}
                {boxLines.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {boxLines.map((l) => (
                      <div
                        key={l.key}
                        className="flex items-center justify-between gap-3 bg-[#FAF6F0] border border-[#E8DFD5] rounded-xl px-3 py-2"
                      >
                        <p className="text-xs text-[#2D1E18] min-w-0">
                          {[describePicks(l.selections), l.addOns?.map((a) => `+ ${a}`).join(", ")].filter(Boolean).join(" · ") ||
                            text("drop.regular")}
                          {l.addOns?.length ? (
                            <span className="text-[#8A756C]">
                              {" "}
                              · {text("addon.each", { price: formatPrice(unitPrice(dp, l.addOns)) })}
                            </span>
                          ) : null}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => updateLine(dp.id, -1, l.selections, l.addOns)}
                            aria-label="One less"
                            className="w-7 h-7 rounded-md border border-stone-200 bg-white font-bold text-sm hover:bg-stone-50"
                          >
                            -
                          </button>
                          <span className="w-5 text-center font-bold text-xs">{l.quantity}</span>
                          <button
                            disabled={!canAdd(dp.id)}
                            onClick={() => updateLine(dp.id, 1, l.selections, l.addOns)}
                            aria-label="One more"
                            className="w-7 h-7 rounded-md bg-amber-600 text-white font-bold text-sm disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Step 3: Discount, gift card & payment method (contact details come in checkout) */}
        {canOrder && totalItemsCount > 0 && (
          <section className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-4">
            <h2 className="font-bold text-lg text-[#2D1E18]">{text("drop.step3")}</h2>

            <div>
              <label className="block text-xs font-bold text-[#2D1E18] mb-1">{text("drop.discountLabel")}</label>
              <DiscountInput
                type="DROP"
                subtotal={cartTotal}
                email={details.email}
                onEmail={(email) => setDetails((d) => ({ ...d, email }))}
                onChange={setDiscount}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#2D1E18] mb-1">{text("drop.giftLabel")}</label>
              <GiftCardInput amountDue={cartTotal - (discount?.discount ?? 0)} onChange={setGift} />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#2D1E18] mb-2">{text("drop.paymentLabel")}</label>
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
                    {text("pay.card")}
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
                    {text("pay.venmo")}
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
                    {text("pay.paypal")}
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
        <p className="text-[11px] text-[#8A756C] text-center">
          {text("drop.agree")}{" "}
          <Link href="/terms" className="underline">{text("footer.terms")}</Link> &amp;{" "}
          <Link href="/privacy" className="underline">{text("footer.privacy")}</Link>.
        </p>
      </main>

      <LegalFooter />

      {/* Floating Checkout Bar */}
      {canOrder && totalItemsCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-stone-200 p-4 shadow-2xl z-40 max-w-3xl mx-auto rounded-t-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs text-[#735D54]">{text("drop.selected", { count: totalItemsCount })}</div>
              <div className="text-xl font-black text-[#2D1E18]">
                {(discount || gift) && (
                  <span className="text-sm font-medium text-stone-400 line-through mr-2">{formatPrice(cartTotal)}</span>
                )}
                {formatPrice(cartTotal - (discount?.discount ?? 0) - (gift?.amount ?? 0))}
              </div>
            </div>
            <button
              onClick={startCheckout}
              disabled={submitting}
              className="bg-amber-600 hover:bg-amber-700 text-white font-black px-8 py-3.5 rounded-xl shadow-sm transition disabled:opacity-50 text-sm"
            >
              {text("drop.checkout")}
            </button>
          </div>
        </div>
      )}

      {detailProduct && (
        <ProductDetails
          name={detailProduct.product.name}
          description={detailProduct.product.description}
          imageUrl={detailProduct.product.imageUrl}
          price={formatPrice(priceOf(detailProduct))}
          onClose={() => setDetailsFor(null)}
        />
      )}

      {boxProduct && (
        <BoxBuilder
          name={boxProduct.product.name}
          price={priceOf(boxProduct)}
          boxSize={boxProduct.product.boxSize!}
          options={dropBoxOptions(boxProduct.product.boxOptions, boxProduct.boxOptions)}
          addOns={productAddOns(boxProduct.product.addOns)}
          onAdd={(picks, addOnNames) => {
            updateLine(boxProduct.id, 1, picks, addOnNames.length ? addOnNames : undefined);
            setBuildingBoxFor(null);
          }}
          onClose={() => setBuildingBoxFor(null)}
        />
      )}

      {addOnProduct && (
        <AddOnPicker
          name={addOnProduct.product.name}
          price={priceOf(addOnProduct)}
          addOns={productAddOns(addOnProduct.product.addOns)}
          maxQty={
            addOnProduct.quantityLimit === null
              ? null
              : addOnProduct.quantityLimit - addOnProduct.quantitySold - qtyInCart(addOnProduct.id)
          }
          onAdd={(quantity, addOnNames) => {
            updateLine(addOnProduct.id, quantity, undefined, addOnNames.length ? addOnNames : undefined);
            setAddingTo(null);
          }}
          onClose={() => setAddingTo(null)}
        />
      )}

      {/* Checkout step 1: who the order is for */}
      {showDetails && (
        <ContactDetailsModal
          details={details}
          onChange={setDetails}
          required
          submitting={submitting}
          error={detailsError}
          onSubmit={placeOrder}
          onClose={() => setShowDetails(false)}
        />
      )}

      {/* Checkout step 2: payment */}
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
