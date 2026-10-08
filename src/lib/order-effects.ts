import type { Prisma } from "@prisma/client";
import { adjustStock, countsStock } from "@/lib/stock";
import { adjustDiscountUse } from "@/lib/discounts";
import { adjustGiftBalance } from "@/lib/gift";
import { isPaidStatus } from "@/lib/pickup";

type OrderForEffects = {
  id: string;
  type: string;
  discountCode: string | null;
  giftCode: string | null;
  giftAmount: number;
  items: { dropProductId: string | null; farmstandItemId: string | null; quantity: number }[];
};

/**
 * Everything an order "uses up" — stock, a discount code use, gift card
 * balance — is counted when it enters a counted status and given back when it
 * leaves one (cancel/refund). A gift card *bought* by the order becomes usable
 * only once the order is paid, and is voided if that payment is undone.
 * Call with the status before and after every status change.
 *
 * Returns the gift card that was just activated, if any (for notifications).
 */
export async function applyStatusChange(
  tx: Prisma.TransactionClient,
  order: OrderForEffects,
  before: string | null,
  after: string
) {
  const wasCounted = before !== null && countsStock(before);
  const isCounted = countsStock(after);
  if (wasCounted !== isCounted) {
    const dir = isCounted ? 1 : -1;
    await adjustStock(tx, order.items, dir);
    await adjustDiscountUse(tx, order.discountCode, dir);
    await adjustGiftBalance(tx, order.giftCode, order.giftAmount, dir);
  }

  if (order.type !== "GIFT") return null;
  const wasPaid = before !== null && isPaidStatus(before);
  const isPaid = isPaidStatus(after);
  if (!wasPaid && isPaid) {
    await tx.giftCertificate.updateMany({
      where: { orderId: order.id, status: "PENDING" },
      data: { status: "ACTIVE" },
    });
    return tx.giftCertificate.findUnique({ where: { orderId: order.id } });
  }
  if (wasPaid && !isPaid) {
    await tx.giftCertificate.updateMany({ where: { orderId: order.id }, data: { status: "VOID" } });
  }
  if (!isPaid && (after === "CANCELLED" || after === "REFUNDED")) {
    await tx.giftCertificate.updateMany({ where: { orderId: order.id, status: "PENDING" }, data: { status: "VOID" } });
  }
  return null;
}
