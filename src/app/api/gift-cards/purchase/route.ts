import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { getSetting } from "@/lib/settings";
import { fireNotification } from "@/lib/notifications";
import { generateGiftCode } from "@/lib/gift";

const MIN = 500; // $5
const MAX = 50000; // $500

/**
 * Buy a gift card online. Creates a GIFT order plus a PENDING gift card that
 * activates when the order is paid (Stripe webhook, or the owner confirming a
 * Venmo/PayPal payment).
 */
export async function POST(req: Request) {
  const session = await auth();
  const body = await req.json().catch(() => ({}));
  const amount = Math.round(Number(body.amount));
  const paymentMethod = ["STRIPE", "VENMO", "PAYPAL"].includes(body.paymentMethod) ? body.paymentMethod : null;
  const purchaserEmail = String(body.purchaserEmail ?? "").trim();
  const recipientEmail = String(body.recipientEmail ?? "").trim();
  const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;

  if (!Number.isInteger(amount) || amount < MIN || amount > MAX) {
    return NextResponse.json({ error: "Gift cards can be $5 to $500" }, { status: 400 });
  }
  if (!paymentMethod) return NextResponse.json({ error: "Choose a payment method" }, { status: 400 });
  if (!/^\S+@\S+\.\S+$/.test(purchaserEmail)) {
    return NextResponse.json({ error: "Enter your email for the receipt" }, { status: 400 });
  }
  if (recipientEmail && !/^\S+@\S+\.\S+$/.test(recipientEmail)) {
    return NextResponse.json({ error: "The recipient's email doesn't look right" }, { status: 400 });
  }

  let stripeFields: { stripePaymentIntentId: string; stripeClientSecret: string | null } | null = null;
  if (paymentMethod === "STRIPE") {
    const stripe = await getStripe();
    if (!stripe) return NextResponse.json({ error: "Card payments are not set up yet" }, { status: 500 });
    const pi = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { type: "GIFT", guestEmail: purchaserEmail },
    });
    stripeFields = { stripePaymentIntentId: pi.id, stripeClientSecret: pi.client_secret };
  }

  const order = await prisma.order.create({
    data: {
      type: "GIFT",
      userId: session?.user?.id || null,
      guestEmail: purchaserEmail,
      guestName: clean(body.fromName, 80), // the buyer's name, as they signed the card
      paymentMethod,
      status: paymentMethod === "STRIPE" ? "PENDING" : "AWAITING_CONFIRM",
      subtotal: amount,
      total: amount,
      notes: recipientEmail ? `Gift card for ${clean(body.recipientName, 100) ?? recipientEmail}` : "Gift card",
      ...(stripeFields ?? {}),
    },
  });
  await prisma.giftCertificate.create({
    data: {
      code: generateGiftCode(),
      initialAmount: amount,
      balance: amount,
      status: "PENDING",
      recipientName: clean(body.recipientName, 100),
      recipientEmail: recipientEmail || null,
      fromName: clean(body.fromName, 100),
      message: clean(body.message, 500),
      purchaserEmail,
      orderId: order.id,
    },
  });

  if (paymentMethod !== "STRIPE") {
    const appUrl = await getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || "");
    await fireNotification("order.awaiting_payment", {
      orderId: order.id,
      type: "GIFT",
      total: amount,
      paymentMethod,
      paymentHandle: await getSetting(paymentMethod === "PAYPAL" ? "PAYPAL_ME_USERNAME" : "VENMO_USERNAME"),
      customerEmail: purchaserEmail,
      customerName: clean(body.fromName, 80),
      notes: order.notes,
      ownerEmail: await getSetting("ADMIN_EMAIL"),
      adminUrl: `${appUrl}/admin`,
    });
  }

  return NextResponse.json({
    orderId: order.id,
    clientSecret: stripeFields?.stripeClientSecret ?? null,
    paymentMethod,
    total: amount,
    status: order.status,
  });
}
