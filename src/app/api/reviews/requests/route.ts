import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";

export const dynamic = "force-dynamic";

/** Admin → Reviews: every review request sent, newest first, and whether it turned into a review. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orders = await prisma.order.findMany({
    where: { reviewRequestedAt: { not: null } },
    orderBy: { reviewRequestedAt: "desc" },
    take: 500,
    select: {
      id: true,
      reviewRequestedAt: true,
      reviewVia: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
      user: { select: { name: true, email: true } },
    },
  });
  const reviews = await prisma.review.findMany({
    where: { orderId: { in: orders.map((o) => o.id) } },
    select: { orderId: true, rating: true },
  });
  const byOrder = new Map(reviews.map((r) => [r.orderId, r.rating]));
  return NextResponse.json(
    orders.map((o) => ({
      orderId: o.id,
      sentAt: o.reviewRequestedAt!.toISOString(),
      via: o.reviewVia,
      customer: o.guestName || o.user?.name || o.guestEmail || o.user?.email || o.guestPhone || "Customer",
      rating: byOrder.get(o.id) ?? null,
    }))
  );
}
