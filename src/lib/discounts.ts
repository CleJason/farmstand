import type { DiscountCode, Prisma } from "@prisma/client";

export class DiscountError extends Error {}

export const normalizeCode = (code: unknown) =>
  String(code ?? "")
    .trim()
    .toUpperCase();

/**
 * Check a code against an order and return the cents to take off.
 * Throws DiscountError with a customer-friendly message when it doesn't apply.
 */
export async function evaluateDiscount(
  db: Prisma.TransactionClient,
  rawCode: unknown,
  orderType: "DROP" | "FARMSTAND",
  subtotal: number
): Promise<{ code: DiscountCode; amount: number }> {
  const code = normalizeCode(rawCode);
  const discount = await db.discountCode.findUnique({ where: { code } });
  if (!discount || !discount.active) throw new DiscountError("That discount code isn't valid");
  if (discount.expiresAt && discount.expiresAt < new Date()) {
    throw new DiscountError("That discount code has expired");
  }
  if (discount.maxUses !== null && discount.uses >= discount.maxUses) {
    throw new DiscountError("That discount code has been fully used");
  }
  if (discount.appliesTo !== "ALL" && discount.appliesTo !== orderType) {
    throw new DiscountError(
      discount.appliesTo === "DROP" ? "That code only works on pre-orders" : "That code only works at the farmstand"
    );
  }
  if (discount.minSubtotal !== null && subtotal < discount.minSubtotal) {
    throw new DiscountError(`That code needs an order of at least $${(discount.minSubtotal / 100).toFixed(2)}`);
  }

  const amount =
    discount.type === "PERCENT"
      ? Math.round((subtotal * Math.min(100, discount.value)) / 100)
      : Math.min(discount.value, subtotal);
  return { code: discount, amount };
}

/** Count (1) or release (-1) one use of a code, alongside stock. */
export async function adjustDiscountUse(
  tx: Prisma.TransactionClient,
  code: string | null | undefined,
  direction: 1 | -1
) {
  if (!code) return;
  await tx.discountCode.updateMany({ where: { code }, data: { uses: { increment: direction } } });
}
