import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkCardPayment, checkHostedCheckout } from "@/lib/stripe-paid";

export const dynamic = "force-dynamic";

/**
 * The customer's browser says the card went through (on the site, or on
 * Stripe's checkout page: `session`). We don't trust that: we ask Stripe
 * directly, and only a payment Stripe reports as succeeded marks the order
 * Paid. Means confirmations don't depend on the webhook alone.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session } = await req.json().catch(() => ({}));
  try {
    if (typeof session === "string" && session.startsWith("cs_")) await checkHostedCheckout(id, session);
    else await checkCardPayment(id);
    const order = await prisma.order.findUnique({ where: { id }, select: { status: true, type: true, guestEmail: true } });
    const paid = !!order && ["PAID", "READY", "PICKED_UP"].includes(order.status);
    return NextResponse.json({ paid, type: order?.type ?? null, hasEmail: !!order?.guestEmail });
  } catch (err) {
    console.error("Card payment check failed", id, err);
    return NextResponse.json({ paid: false });
  }
}
