import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DiscountError, evaluateDiscount } from "@/lib/discounts";

/**
 * Lets checkout preview a code ("Apply"). The order route re-checks it, so
 * this is only for showing the customer the discount before they pay.
 */
export async function POST(req: Request) {
  const { code, type, subtotal } = await req.json().catch(() => ({}));
  try {
    const { code: d, amount } = await evaluateDiscount(
      prisma,
      code,
      type === "FARMSTAND" ? "FARMSTAND" : "DROP",
      Math.max(0, Math.round(Number(subtotal) || 0))
    );
    return NextResponse.json({ valid: true, code: d.code, discount: amount });
  } catch (err) {
    if (err instanceof DiscountError) return NextResponse.json({ valid: false, error: err.message });
    throw err;
  }
}
