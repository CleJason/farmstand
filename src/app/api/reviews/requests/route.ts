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

  // Plus links sent from Admin → Customers (no order here)
  const invites = await prisma.reviewInvite.findMany({ orderBy: { sentAt: "desc" }, take: 500 });
  const inviteReviews = await prisma.review.findMany({
    where: { id: { in: invites.map((i) => i.reviewId).filter(Boolean) as string[] } },
    select: { id: true, rating: true },
  });
  const ratingById = new Map(inviteReviews.map((r) => [r.id, r.rating]));

  return NextResponse.json(
    [
      ...orders.map((o) => ({
        orderId: o.id,
        sentAt: o.reviewRequestedAt!.toISOString(),
        via: o.reviewVia,
        customer: o.guestName || o.user?.name || o.guestEmail || o.user?.email || o.guestPhone || "Customer",
        rating: byOrder.get(o.id) ?? null,
      })),
      ...invites.map((i) => ({
        orderId: i.id,
        sentAt: i.sentAt.toISOString(),
        via: i.via,
        customer: i.name || i.email || i.phone || "Customer",
        rating: i.reviewId ? (ratingById.get(i.reviewId) ?? null) : null,
      })),
    ].sort((a, b) => b.sentAt.localeCompare(a.sentAt))
  );
}
