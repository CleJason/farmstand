import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { fireNotification } from "@/lib/notifications";
import { adjustStock, countsStock } from "@/lib/stock";
import { formatPickup, pickupAddressFor } from "@/lib/pickup";
import { getSiteSettings } from "@/lib/site";

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
  const { status, manualPaymentRef } = data;

  const existing = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const order = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id },
      data: {
        status: status || undefined,
        manualPaymentRef: manualPaymentRef !== undefined ? manualPaymentRef : undefined,
      },
      include: {
        pickupSlot: true,
        user: true,
      },
    });

    // Count stock when the order enters a counted status, release it when it leaves
    const before = countsStock(existing.status);
    const after = countsStock(updated.status);
    if (before !== after) await adjustStock(tx, existing.items, after ? 1 : -1);

    return updated;
  });

  const statusChanged = existing.status !== order.status;
  if (statusChanged && status === "PAID") {
    await fireNotification("order.confirmed", {
      orderId: order.id,
      status: order.status,
      total: order.total,
      customerEmail: order.guestEmail || order.user?.email,
      customerPhone: order.guestPhone || order.user?.phone,
      pickupSlot: order.pickupSlot?.label,
      pickupTime: formatPickup(order.pickupTime),
      pickupLocation: order.pickupSlot?.location ?? null,
      // Paid now, so the customer gets the exact address
      pickupAddress: order.type === "DROP" ? pickupAddressFor(order.pickupSlot, await getSiteSettings()) : null,
    });
  } else if (statusChanged && (status === "CANCELLED" || status === "REFUNDED")) {
    await fireNotification("order.cancelled", {
      orderId: order.id,
      status: order.status,
      total: order.total,
    });
  }

  return NextResponse.json(order);
}
