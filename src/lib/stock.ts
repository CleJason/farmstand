import type { Prisma } from "@prisma/client";

/**
 * An order's items count against stock while it is in one of these statuses.
 * Venmo/PayPal orders reserve stock on creation (AWAITING_CONFIRM); Stripe
 * orders only count once the payment succeeds (PENDING -> PAID). Moving into
 * or out of this set is the only place quantitySold changes, so stock is
 * counted exactly once and released on cancel/refund.
 */
const STOCK_STATUSES = new Set(["AWAITING_CONFIRM", "PAID", "READY", "PICKED_UP"]);

export function countsStock(status: string): boolean {
  return STOCK_STATUSES.has(status);
}

type StockItem = {
  dropProductId: string | null;
  farmstandItemId: string | null;
  quantity: number;
};

/** Add (direction 1) or release (direction -1) the items' quantities. */
export async function adjustStock(
  tx: Prisma.TransactionClient,
  items: StockItem[],
  direction: 1 | -1
) {
  for (const item of items) {
    const change = { quantitySold: { increment: direction * item.quantity } };
    if (item.dropProductId) {
      await tx.dropProduct.update({ where: { id: item.dropProductId }, data: change });
    } else if (item.farmstandItemId) {
      await tx.farmstandItem.update({ where: { id: item.farmstandItemId }, data: change });
    }
  }
}
