import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { fireNotification } from "@/lib/notifications";
import { formatPickup } from "@/lib/pickup";
import { phoneKey } from "@/lib/phone";
import { optedOutSet } from "@/lib/sms-opt-out";
import { getSiteSettings, isOn } from "@/lib/site";
import { channelsFor } from "@/lib/subscribers";
import { isTextingTime } from "@/lib/text-hours";

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
  // Outside texting hours: the background check announces it once they start
  if (!(await isTextingTime())) return;
  const now = new Date();
  const { count } = await prisma.drop.updateMany({
    where: { id: dropId, status: "OPEN", announcedAt: null, orderOpenAt: { lte: now }, orderCloseAt: { gt: now } },
    data: { announcedAt: now },
  });
  if (count !== 1) return;

  let done = false;
  try {
    done = await sendAnnouncement(dropId);
  } catch (err) {
    console.error(`[drop-alerts] Announcing drop ${dropId} failed:`, err);
  }
  if (!done) {
    // n8n didn't take it (down, wrong address) or something broke: the next background check tries again
    await prisma.drop.update({ where: { id: dropId }, data: { announcedAt: null } });
  }
}

/** The alert itself. True once it's handed to n8n (or there's nobody to tell). */
async function sendAnnouncement(dropId: string): Promise<boolean> {
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
  if (!drop || subscribers.length === 0) return true;
  const optedOut = await optedOutSet();
  const site = await getSiteSettings();
  const shop = isOn(site.SITE_NAME_IN_NOTIFICATIONS) ? site.SITE_NAME : "";
  const dropUrl = `${appUrl}/drops/${drop.id}`;
  const closes = formatPickup(drop.orderCloseAt);
  // The text everyone with a phone gets (n8n sends it, one every few seconds)
  const smsMessage =
    `${shop ? `${shop}: ` : ""}${drop.title} is open for orders! ${dropUrl}` +
    `${closes ? ` Orders close ${closes}.` : ""} Reply STOP to opt out.`;

  // Text, email or both, as each person chose (people from before the choice: email plus a text)
  const reach = subscribers.map((s) => {
    const key = phoneKey(s.phone);
    return { s, key, ...channelsFor(s.dropVia, { hasEmail: !!s.email, canText: !!key && !optedOut.has(key) }, "both") };
  });
  // One text per number, even if it's on the list twice
  const textKeys = new Set<string>(reach.filter((r) => r.text).map((r) => r.key));

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
    subscribers: reach.map(({ s, key, text, email }) => {
      // n8n emails everyone with an email here and texts everyone marked canText.
      // Only the first entry for a number is marked, so nobody gets the same text twice.
      const canText = text && textKeys.delete(key);
      return {
        email: email ? s.email : null,
        phone: s.phone,
        canText,
        unsubscribeUrl: `${appUrl}/unsubscribe?token=${s.unsubscribeToken}`,
      };
    }),
  });

  if (!sent) {
    console.error(`[drop-alerts] n8n didn't take the alert for drop ${drop.id}; will retry`);
    return false;
  }

  // Show the alert texts in Admin → Messages, like any other text the shop sends
  const texted = reach.filter((r) => r.text).map((r) => r.key);
  // (It's already sent: a hiccup saving these must not send it again)
  if (texted.length) {
    await prisma.smsMessage
      .createMany({ data: [...new Set(texted)].map((phone) => ({ phone, direction: "OUT", body: smsMessage, read: true })) })
      .catch((err) => console.error("[drop-alerts] Couldn't save the texts to Messages:", err));
  }
  return true;
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
