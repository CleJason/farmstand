import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { fireNotification, itemsWithNames, notificationItems } from "@/lib/notifications";
import { applyStatusChange } from "@/lib/order-effects";
import { notifyGiftActivated } from "@/lib/gift-notify";
import { formatPickup, pickupAddressFor } from "@/lib/pickup";
import { getSiteSettings } from "@/lib/site";
import { countsStock } from "@/lib/stock";
import { getStripe } from "@/lib/stripe";
import { maybeRequestReview } from "@/lib/review-requests";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Full order details (customer info, pickup address) are admin-only;
  // customers get their pickup address from /api/orders/[id]/pickup once paid
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          dropProduct: { include: { product: true } },
          farmstandItem: true,
        },
      },
      pickupSlot: true,
      user: true,
      drop: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json(order);
}

/**
 * Remove an order for good (e.g. a test order). Only orders that no longer
 * count toward stock, discounts or gift cards can be deleted, so cancel a live
 * order first; that releases its stock, then deleting changes nothing else.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (countsStock(order.status)) {
    return NextResponse.json({ error: "Cancel the order first, then delete it" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    // A gift card this order was buying never became usable; remove it too
    await tx.giftCertificate.deleteMany({ where: { orderId: id, status: { not: "ACTIVE" } } });
    await tx.order.delete({ where: { id } });
  });
  return NextResponse.json({ success: true });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const data = await req.json();
  let status: string | undefined = data.status || undefined;
  const { manualPaymentRef } = data;

  const existing = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Cancelling or refunding a paid card order sends the money back through Stripe
  // first; only if that works does the order change (and it's marked Refunded).
  const paidByCard =
    existing.paymentMethod === "STRIPE" && !!existing.stripePaymentIntentId && countsStock(existing.status) && existing.total > 0;
  if (paidByCard && (status === "CANCELLED" || status === "REFUNDED")) {
    const stripe = await getStripe();
    if (!stripe) {
      return NextResponse.json({ error: "Card payments aren't set up, so this can't be refunded automatically" }, { status: 400 });
    }
    try {
      await stripe.refunds.create(
        { payment_intent: existing.stripePaymentIntentId!, amount: existing.total },
        { idempotencyKey: `refund-${existing.id}` }
      );
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e.code !== "charge_already_refunded") {
        return NextResponse.json({ error: `Stripe couldn't refund it: ${e.message ?? "unknown error"}` }, { status: 400 });
      }
    }
    status = "REFUNDED";
  }

  const { order, activatedGift } = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id },
      data: {
        status,
        manualPaymentRef: manualPaymentRef !== undefined ? manualPaymentRef : undefined,
      },
      include: {
        pickupSlot: true,
        user: true,
        items: itemsWithNames,
      },
    });

    // Stock, discount use and gift card balance follow the status; a gift card
    // bought by this order activates once it's paid
    const activatedGift = await applyStatusChange(tx, existing, existing.status, updated.status);
    return { order: updated, activatedGift };
  });

  const statusChanged = existing.status !== order.status;
  if (activatedGift) {
    await notifyGiftActivated(activatedGift);
  } else if (statusChanged && status === "PAID" && order.type !== "GIFT") {
    await fireNotification("order.confirmed", {
      orderId: order.id,
      type: order.type,
      status: order.status,
      total: order.total,
      customerName: order.guestName || order.user?.name || null,
      customerEmail: order.guestEmail || order.user?.email,
      customerPhone: order.guestPhone || order.user?.phone,
      pickupSlot: order.pickupSlot?.label,
      pickupTime: formatPickup(order.pickupTime),
      pickupLocation: order.pickupSlot?.location ?? null,
      items: notificationItems(order.items),
      // Paid now, so the customer gets the exact address
      pickupAddress: order.type === "DROP" ? pickupAddressFor(order.pickupSlot, await getSiteSettings()) : null,
    });
  } else if (statusChanged && status === "PICKED_UP") {
    // "How was it?" email, if this customer is due one
    await maybeRequestReview(order.id);
  } else if (statusChanged && (status === "CANCELLED" || status === "REFUNDED") && data.notify !== false) {
    // (`notify: false` cancels quietly, e.g. a duplicate the customer already paid for another way)
    await fireNotification("order.cancelled", {
      orderId: order.id,
      type: order.type,
      status: order.status,
      total: order.total,
      customerName: order.guestName || order.user?.name || null,
      customerEmail: order.guestEmail || order.user?.email,
      customerPhone: order.guestPhone || order.user?.phone,
    });
  }

  return NextResponse.json(order);
}
