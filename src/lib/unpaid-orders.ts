import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { applyStatusChange } from "@/lib/order-effects";

/** How long an unpaid Venmo/PayPal order holds its items before it cancels itself (0 = never). */
export async function unpaidCancelHours(): Promise<number> {
  const n = Math.round(Number(await getSetting("UNPAID_CANCEL_HOURS", "24")));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 720) : 24;
}

/**
 * Orders still waiting on a Venmo/PayPal payment after that long are cancelled
 * quietly, which gives back the items and pickup time they were holding.
 * Runs with the other once-a-minute jobs.
 */
export async function cancelStaleUnpaid(): Promise<void> {
  const hours = await unpaidCancelHours();
  if (!hours) return;
  const stale = await prisma.order.findMany({
    where: { status: "AWAITING_CONFIRM", createdAt: { lt: new Date(Date.now() - hours * 3600_000) } },
    include: { items: true },
  });
  for (const order of stale) {
    await prisma.$transaction(async (tx) => {
      // Only if it's still unpaid (the owner may have just confirmed it)
      const { count } = await tx.order.updateMany({ where: { id: order.id, status: "AWAITING_CONFIRM" }, data: { status: "CANCELLED" } });
      if (count === 1) await applyStatusChange(tx, order, "AWAITING_CONFIRM", "CANCELLED");
    });
    console.log(`[unpaid] Cancelled order ${order.id.slice(-6).toUpperCase()}: not paid after ${hours} hours`);
  }
}
