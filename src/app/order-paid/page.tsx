"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useText } from "@/components/SiteProvider";
import SpamHint from "@/components/SpamHint";

/** Where Stripe's checkout page sends customers back: confirm the payment and say thanks. */
function OrderPaid() {
  const text = useText();
  const params = useSearchParams();
  const orderId = params.get("order") ?? "";
  const session = params.get("session") ?? "";
  const [state, setState] = useState<"checking" | "paid" | "waiting">("checking");
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let tries = 0;
    let stop = false;
    const check = async () => {
      tries++;
      const res = await fetch(`/api/orders/${orderId}/card-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session }),
      })
        .then((r) => r.json())
        .catch(() => ({ paid: false }));
      if (stop) return;
      if (res.paid) {
        setState("paid");
        if (res.type === "DROP") {
          fetch(`/api/orders/${orderId}/pickup`)
            .then((r) => r.json())
            .then((p) => setAddress(p.address ?? null))
            .catch(() => {});
        }
      } else if (tries < 4) {
        setTimeout(check, 3000);
      } else {
        setState("waiting");
      }
    };
    check();
    return () => {
      stop = true;
    };
  }, [orderId, session]);

  return (
    <div className="max-w-md bg-white p-8 rounded-2xl shadow-sm border border-stone-200 space-y-4 text-center">
      <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto text-3xl font-bold">
        {state === "checking" ? "…" : "✓"}
      </div>
      <h1 className="text-2xl font-black text-[#2D1E18]">
        {state === "checking" ? text("paid.checking") : text("paid.title")}
      </h1>
      {state === "paid" && <p className="text-sm text-[#735D54] leading-relaxed">{text("paid.text")}</p>}
      {state === "waiting" && <p className="text-sm text-[#735D54] leading-relaxed">{text("paid.notYet")}</p>}
      {address && (
        <div className="text-left text-sm bg-[#FAF6F0] rounded-xl p-3 space-y-1">
          <p className="font-semibold text-[#2D1E18]">{text("drop.addressTitle")}</p>
          <p className="text-[#735D54] whitespace-pre-line">{address}</p>
        </div>
      )}
      {state !== "checking" && <SpamHint />}
      <Link
        href="/"
        className="inline-block w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl text-sm"
      >
        {text("drop.backHome")}
      </Link>
    </div>
  );
}

export default function OrderPaidPage() {
  return (
    <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-6">
      <Suspense fallback={null}>
        <OrderPaid />
      </Suspense>
    </div>
  );
}
