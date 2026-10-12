import { NextResponse } from "next/server";
import { checkCardPayment } from "@/lib/stripe-paid";

export const dynamic = "force-dynamic";

/**
 * The customer's browser says the card went through. We don't trust that:
 * we ask Stripe directly, and only a payment Stripe reports as succeeded marks
 * the order Paid. Means confirmations don't depend on the webhook alone.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json({ paid: await checkCardPayment(id) });
  } catch (err) {
    console.error("Card payment check failed", id, err);
    return NextResponse.json({ paid: false });
  }
}
