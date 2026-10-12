import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { fireNotification, itemsWithNames, notificationItems } from "@/lib/notifications";
import { getSetting } from "@/lib/settings";
import { countsStock } from "@/lib/stock";
import { applyStatusChange } from "@/lib/order-effects";
import { notifyGiftActivated } from "@/lib/gift-notify";
import { formatPickup, pickupAddressFor } from "@/lib/pickup";
import { getSiteSettings } from "@/lib/site";

/**
 * A card payment succeeded: mark its order Paid (stock, discount, gift card)
 * and send the confirmation. Safe to call more than once: the Stripe webhook,
 * the customer's browser and the background check may all report the same
 * payment, and only the first one does anything.
 */
export async function markCardOrderPaid(paymentIntentId: string, orderIdHint?: string): Promise<boolean> {
  // Paid on Stripe's own checkout page: that payment is new, so point the order at it first
  if (orderIdHint) {
    await prisma.order.updateMany({
      where: { id: orderIdHint, status: "PENDING", paymentMethod: "STRIPE", NOT: { stripePaymentIntentId: paymentIntentId } },
      data: { stripePaymentIntentId: paymentIntentId, stripeClientSecret: null },
    });
  }
  const order = await prisma.order.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    include: { items: itemsWithNames, pickupSlot: true, user: true },
  });
  // Already counted, or the owner already moved the order along
  if (!order || countsStock(order.status) || order.status === "CANCELLED" || order.status === "REFUNDED") {
    return false;
  }

  const result = await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: "PAID" },
    });
    if (count !== 1) return null;
    // Stock, discount use, gift card spend; activates a gift card this order bought
    return { activatedGift: await applyStatusChange(tx, order, order.status, "PAID") };
  });
  if (!result) return false;

  if (order.type === "GIFT") {
    if (result.activatedGift) await notifyGiftActivated(result.activatedGift);
    return true;
  }

  await sendOrderConfirmation(order.id, { toOwner: true });
  return true;
}

/**
 * The "order confirmed" email/text for a paid order. Admin → Orders can send it
 * again (toOwner false, so the owner isn't alerted twice).
 */
export async function sendOrderConfirmation(orderId: string, { toOwner }: { toOwner: boolean }): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: itemsWithNames, pickupSlot: true, user: true },
  });
  if (!order || !countsStock(order.status) || order.type === "GIFT") return false;
  return fireNotification(order.type === "FARMSTAND" ? "farmstand.purchased" : "order.confirmed", {
    orderId: order.id,
    type: order.type,
    status: "PAID",
    paymentMethod: order.paymentMethod,
    // So the owner hears about card orders too (they confirm themselves)
    ...(toOwner
      ? {
          ownerEmail: await getSetting("ADMIN_EMAIL"),
          adminUrl: `${await getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || "")}/admin`,
        }
      : {}),
    total: order.total,
    customerName: order.guestName || order.user?.name || null,
    customerEmail: order.guestEmail || order.user?.email,
    customerPhone: order.guestPhone || order.user?.phone,
    pickupSlot: order.pickupSlot?.label,
    pickupTime: formatPickup(order.pickupTime),
    pickupLocation: order.pickupSlot?.location ?? null,
    items: notificationItems(order.items),
    // Paid, so the customer gets the exact address
    pickupAddress: order.type === "DROP" ? pickupAddressFor(order.pickupSlot, await getSiteSettings()) : null,
  });
}

/** Ask Stripe whether this order's card payment went through; mark it Paid if so. */
export async function checkCardPayment(orderId: string): Promise<boolean> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order?.stripePaymentIntentId || order.paymentMethod !== "STRIPE") return false;
  const stripe = await getStripe();
  if (!stripe) return false;
  const intent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
  if (intent.status !== "succeeded") return false;
  return markCardOrderPaid(intent.id);
}

/**
 * Backstop for a missed or misconfigured Stripe webhook: re-check unfinished
 * card checkouts from the last two days. Runs in the background every minute.
 */
export async function sweepCardPayments(): Promise<void> {
  const pending = await prisma.order.findMany({
    where: {
      status: "PENDING",
      paymentMethod: "STRIPE",
      stripePaymentIntentId: { not: null },
      createdAt: { gt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
    take: 50,
  });
  for (const o of pending) {
    try {
      await checkCardPayment(o.id);
    } catch (err) {
      console.error("Card payment check failed", o.id, err);
    }
  }
  if (pending.length) await sweepHostedCheckouts(new Set(pending.map((o) => o.id)));
}

/** Orders paid on Stripe's own checkout page whose customer never came back to the site. */
async function sweepHostedCheckouts(pendingIds: Set<string>) {
  const stripe = await getStripe();
  if (!stripe) return;
  const sessions = await stripe.checkout.sessions.list({
    limit: 50,
    created: { gt: Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60 },
  });
  for (const s of sessions.data) {
    const orderId = s.metadata?.orderId;
    if (orderId && pendingIds.has(orderId) && s.payment_status === "paid" && typeof s.payment_intent === "string") {
      await markCardOrderPaid(s.payment_intent, orderId);
    }
  }
}

/** Back from Stripe's checkout page: check that session really paid for this order. */
export async function checkHostedCheckout(orderId: string, sessionId: string): Promise<boolean> {
  const stripe = await getStripe();
  if (!stripe) return false;
  const s = await stripe.checkout.sessions.retrieve(sessionId);
  if (s.metadata?.orderId !== orderId || s.payment_status !== "paid" || typeof s.payment_intent !== "string") return false;
  await markCardOrderPaid(s.payment_intent, orderId);
  return true;
}
