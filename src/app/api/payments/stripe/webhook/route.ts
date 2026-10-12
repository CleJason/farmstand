import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSetting } from "@/lib/settings";
import { markCardOrderPaid } from "@/lib/stripe-paid";

export async function POST(req: Request) {
  const stripe = await getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not initialized" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "No signature provided" }, { status: 400 });
  }

  const webhookSecret = await getSetting("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET || "");
  if (!webhookSecret) {
    console.warn("STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook secret missing" }, { status: 500 });
  }

  const payload = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Stripe webhook verification failed:", message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  // A failed attempt leaves the order Pending (the customer can retry), so only success matters
  if (event.type === "payment_intent.succeeded") {
    await markCardOrderPaid(event.data.object.id);
  }

  return NextResponse.json({ received: true });
}
