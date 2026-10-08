import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { fireNotification } from "@/lib/notifications";
import { getSetting } from "@/lib/settings";
import { adjustStock, countsStock } from "@/lib/stock";
import { adjustDiscountUse } from "@/lib/discounts";
import { formatPickup, pickupAddressFor } from "@/lib/pickup";
import { getSiteSettings } from "@/lib/site";

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
  let event: any;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err: any) {
    console.error("Stripe webhook verification failed:", err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    const order = await prisma.order.findFirst({
      where: { stripePaymentIntentId: paymentIntent.id },
      include: {
        items: true,
        pickupSlot: true,
        user: true,
      },
    });

    // Only act on the first delivery: Stripe retries webhooks, and the owner
    // may already have moved the order along manually.
    if (order && !countsStock(order.status)) {
      const marked = await prisma.$transaction(async (tx) => {
        const { count } = await tx.order.updateMany({
          where: { id: order.id, status: order.status },
          data: { status: "PAID" },
        });
        if (count === 1) {
          await adjustStock(tx, order.items, 1);
          await adjustDiscountUse(tx, order.discountCode, 1);
        }
        return count === 1;
      });
      if (!marked) return NextResponse.json({ received: true });

      await fireNotification(
        order.type === "FARMSTAND" ? "farmstand.purchased" : "order.confirmed",
        {
          orderId: order.id,
          type: order.type,
          status: "PAID",
          paymentMethod: "STRIPE",
          total: order.total,
          customerEmail: order.guestEmail || order.user?.email,
          customerPhone: order.guestPhone || order.user?.phone,
          pickupSlot: order.pickupSlot?.label,
          pickupTime: formatPickup(order.pickupTime),
          pickupLocation: order.pickupSlot?.location ?? null,
          // Paid, so the customer gets the exact address
          pickupAddress: order.type === "DROP" ? pickupAddressFor(order.pickupSlot, await getSiteSettings()) : null,
        }
      );
    }
  } else if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object;
    await prisma.order.updateMany({
      where: { stripePaymentIntentId: paymentIntent.id },
      data: { status: "PENDING" },
    });
  }

  return NextResponse.json({ received: true });
}
