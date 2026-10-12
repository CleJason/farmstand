import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { getSetting } from "@/lib/settings";
import { getSiteSettings } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * "Pay on Stripe's secure page": a backup for phones where the card form on
 * the site won't load (blockers, some in-app browsers). Sends the customer to
 * Stripe's own checkout page for this order's total; they come back to
 * /order-paid, which confirms the payment with Stripe.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id }, include: { user: true } });
  if (!order || order.paymentMethod !== "STRIPE") return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "PENDING") return NextResponse.json({ error: "This order is already paid" }, { status: 400 });

  const stripe = await getStripe();
  if (!stripe) return NextResponse.json({ error: "Card payments are not set up" }, { status: 500 });

  const [appUrl, site] = await Promise.all([
    getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || ""),
    getSiteSettings(),
  ]);
  const base = (appUrl || new URL(req.url).origin).replace(/\/+$/, "");
  const back = req.headers.get("referer")?.startsWith(base) ? req.headers.get("referer")! : `${base}/`;
  const no = order.id.slice(-6).toUpperCase();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: order.total,
          product_data: { name: `${site.SITE_NAME} order #${no}` },
        },
      },
    ],
    customer_email: order.guestEmail || order.user?.email || undefined,
    metadata: { orderId: order.id },
    payment_intent_data: { metadata: { orderId: order.id } },
    success_url: `${base}/order-paid?order=${order.id}&session={CHECKOUT_SESSION_ID}`,
    cancel_url: back,
  });
  return NextResponse.json({ url: session.url });
}
