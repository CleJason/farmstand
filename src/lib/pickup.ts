import type { PickupSlot, Prisma } from "@prisma/client";

/** Orders in these statuses take up a pickup time (same rule as stock). */
export const PICKUP_COUNTED_STATUSES = ["AWAITING_CONFIRM", "PAID", "READY", "PICKED_UP"];

type Window = Pick<PickupSlot, "pickupDate" | "endDate" | "intervalMinutes">;

/** The times a customer can pick in a window: start, start+interval, … up to and including the end. */
export function pickupTimes(slot: Window): Date[] {
  if (!slot.endDate) return [slot.pickupDate];
  const step = Math.max(5, slot.intervalMinutes || 30) * 60_000;
  const times: Date[] = [];
  for (let t = slot.pickupDate.getTime(); t <= slot.endDate.getTime() && times.length < 200; t += step) {
    times.push(new Date(t));
  }
  return times;
}

/** How many active orders already have each time, keyed by `${slotId}|${iso}`. */
export async function pickupTimeCounts(
  db: Prisma.TransactionClient,
  slotIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (slotIds.length === 0) return counts;
  const rows = await db.order.groupBy({
    by: ["pickupSlotId", "pickupTime"],
    where: { pickupSlotId: { in: slotIds }, status: { in: PICKUP_COUNTED_STATUSES } },
    _count: { _all: true },
  });
  for (const r of rows) {
    if (r.pickupSlotId && r.pickupTime) {
      counts.set(`${r.pickupSlotId}|${r.pickupTime.toISOString()}`, r._count._all);
    }
  }
  return counts;
}

/** Window times with whether each one is already full. */
export function timesWithAvailability(slot: PickupSlot, counts: Map<string, number>) {
  return pickupTimes(slot).map((t) => {
    const taken = counts.get(`${slot.id}|${t.toISOString()}`) ?? 0;
    return { time: t.toISOString(), full: slot.maxPerTime !== null && taken >= slot.maxPerTime };
  });
}

/** "Fri, Oct 9, 4:00 PM" in the server's timezone (TZ env), for emails/texts. */
export function formatPickup(time: Date | null | undefined): string | null {
  if (!time) return null;
  return time.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: process.env.TZ || undefined,
  });
}
