import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { fireNotification } from "@/lib/notifications";
import { formatPickup } from "@/lib/pickup";
import { phoneKey } from "@/lib/phone";
import { optedOutSet } from "@/lib/sms-opt-out";
import { getSiteSettings, isOn } from "@/lib/site";

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
 * Tell subscribers about a drop once it's published and its ordering time has
 * started (a drop published for later is announced by the background check
 * when it opens). The announcedAt guard means re-opening a drop (or a double
 * click) never sends the alert twice. n8n does the actual emailing and texting.
 */
export async function announceDrop(dropId: string): Promise<void> {
  const now = new Date();
  const { count } = await prisma.drop.updateMany({
    where: { id: dropId, status: "OPEN", announcedAt: null, orderOpenAt: { lte: now }, orderCloseAt: { gt: now } },
    data: { announcedAt: now },
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
    prisma.subscriber.findMany({ where: { dropAlerts: true }, orderBy: { createdAt: "asc" } }),
    getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || ""),
  ]);
  if (!drop || subscribers.length === 0) return;
  const optedOut = await optedOutSet();
  const site = await getSiteSettings();
  const shop = isOn(site.SITE_NAME_IN_NOTIFICATIONS) ? site.SITE_NAME : "";
  const dropUrl = `${appUrl}/drops/${drop.id}`;
  const closes = formatPickup(drop.orderCloseAt);
  // The text everyone with a phone gets (n8n sends it, one every few seconds)
  const smsMessage =
    `${shop ? `${shop}: ` : ""}${drop.title} is open for orders! ${dropUrl}` +
    `${closes ? ` Orders close ${closes}.` : ""} Reply STOP to opt out.`;

  // One text per number, even if it's on the list twice
  const textKeys = new Set<string>();
  for (const s of subscribers) {
    const key = phoneKey(s.phone);
    if (key && !optedOut.has(key)) textKeys.add(key);
  }

  const sent = await fireNotification("drop.announced", {
    smsMessage,
    dropId: drop.id,
    title: drop.title,
    description: drop.description,
    orderCloseAt: closes,
    // Texts expire then (SMS Gate validUntil), so an alert never goes out after the drop closed
    orderCloseAtIso: drop.orderCloseAt.toISOString(),
    pickupWindows: drop.pickupSlots.map((s) => s.label),
    pickupArea: drop.pickupSlots.find((s) => s.location)?.location ?? null,
    products: drop.dropProducts.map((dp) => dp.product.name),
    dropUrl,
    subscribers: subscribers.map((s) => {
      const key = phoneKey(s.phone);
      // Everyone with a phone gets a text (email too if they gave one), unless they replied STOP.
      // Only the first entry for a number is marked, so nobody gets the same text twice.
      const canText = !!key && textKeys.delete(key);
      return {
        email: s.email,
        phone: s.phone,
        canText,
        unsubscribeUrl: `${appUrl}/unsubscribe?token=${s.unsubscribeToken}`,
      };
    }),
  });

  // Show the alert texts in Admin → Messages, like any other text the shop sends
  const texted = subscribers.map((s) => phoneKey(s.phone)).filter((k) => k && !optedOut.has(k));
  if (sent && texted.length) {
    await prisma.smsMessage.createMany({
      data: [...new Set(texted)].map((phone) => ({ phone, direction: "OUT", body: smsMessage, read: true })),
    });
  }
}

/** Background check (every minute): announce published drops whose ordering time has started. */
export async function announceDueDrops(): Promise<void> {
  const now = new Date();
  const due = await prisma.drop.findMany({
    where: { status: "OPEN", announcedAt: null, orderOpenAt: { lte: now }, orderCloseAt: { gt: now } },
    select: { id: true },
  });
  for (const d of due) await announceDrop(d.id);
}
