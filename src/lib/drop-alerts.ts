import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { fireNotification } from "@/lib/notifications";
import { formatPickup } from "@/lib/pickup";
import { phoneKey } from "@/lib/phone";
import { optedOutSet } from "@/lib/sms-opt-out";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(input: unknown): string | null {
  const email = String(input ?? "").trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

export function cleanPhone(input: unknown): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/**
 * Tell subscribers about a drop the first time it opens for orders. The
 * announcedAt guard means re-opening a drop (or a double click) never sends
 * the alert twice. n8n does the actual emailing.
 */
export async function announceDrop(dropId: string): Promise<void> {
  const { count } = await prisma.drop.updateMany({
    where: { id: dropId, status: "OPEN", announcedAt: null },
    data: { announcedAt: new Date() },
  });
  if (count !== 1) return;

  const [drop, subscribers, appUrl] = await Promise.all([
    prisma.drop.findUnique({
      where: { id: dropId },
      include: {
        pickupSlots: { orderBy: { pickupDate: "asc" } },
        dropProducts: { include: { product: true } },
      },
    }),
    prisma.subscriber.findMany({ orderBy: { createdAt: "asc" } }),
    getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || ""),
  ]);
  if (!drop || subscribers.length === 0) return;
  const optedOut = await optedOutSet();

  await fireNotification("drop.announced", {
    dropId: drop.id,
    title: drop.title,
    description: drop.description,
    orderCloseAt: formatPickup(drop.orderCloseAt),
    pickupWindows: drop.pickupSlots.map((s) => s.label),
    pickupArea: drop.pickupSlots.find((s) => s.location)?.location ?? null,
    products: drop.dropProducts.map((dp) => dp.product.name),
    dropUrl: `${appUrl}/drops/${drop.id}`,
    subscribers: subscribers.map((s) => ({
      email: s.email,
      phone: s.phone,
      // Phone-only people get a text instead of an email, unless they replied STOP
      canText: !!phoneKey(s.phone) && !optedOut.has(phoneKey(s.phone)),
      unsubscribeUrl: `${appUrl}/unsubscribe?token=${s.unsubscribeToken}`,
    })),
  });
}
