import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateGift, GiftError } from "@/lib/gift";

/** Checkout preview for a gift card code; the order route re-checks it. */
export async function POST(req: Request) {
  const { code, amountDue } = await req.json().catch(() => ({}));
  try {
    const { gift, amount } = await evaluateGift(prisma, code, Math.max(0, Math.round(Number(amountDue) || 0)));
    return NextResponse.json({ valid: true, code: gift.code, amount, balance: gift.balance });
  } catch (err) {
    if (err instanceof GiftError) return NextResponse.json({ valid: false, error: err.message });
    throw err;
  }
}
