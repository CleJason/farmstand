import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { fireNotification } from "@/lib/notifications";
import { formatPickup } from "@/lib/pickup";
import { phoneKey } from "@/lib/phone";
import { optedOutSet } from "@/lib/sms-opt-out";
import { getSiteSettings, isOn } from "@/lib/site";
import { countsStock } from "@/lib/stock";
import { channelsFor } from "@/lib/subscribers";

/** Admin → Drop Alerts: the "closing soon" reminder is on/off, and how many hours before close. */
export async function reminderSettings() {
  const [enabled, hours] = await Promise.all([
    getSetting("DROP_REMINDER_ENABLED", "true"),
    getSetting("DROP_REMINDER_HOURS", "2"),
  ]);
  return {
    enabled: enabled !== "false",
    hours: Math.min(72, Math.max(1, Math.round(Number(hours) || 2))),
  };
}

/**
 * "Last call" for a drop, once: people on Drop Alerts who haven't ordered from
 * it yet. They get a text if they have a phone (and didn't reply STOP),
 * otherwise an email. n8n sends them spaced out. `now` skips the timing check
 * (the admin's "Send reminder now" button).
 */
export async function remindDrop(dropId: string, { now: sendNow = false } = {}): Promise<{ sent: boolean; texts: number; emails: number }> {
  const none = { sent: false, texts: 0, emails: 0 };
  const now = new Date();
  const { hours } = await reminderSettings();
  const { count } = await prisma.drop.updateMany({
    where: {
      id: dropId,
      status: "OPEN",
      reminderSentAt: null,
      orderOpenAt: { lte: now },
      orderCloseAt: sendNow ? { gt: now } : { gt: now, lte: new Date(now.getTime() + hours * 3600_000) },
    },
    data: { reminderSentAt: now },
  });
  if (count !== 1) return none;

  const [drop, subscribers, orders, appUrl, optedOut, site] = await Promise.all([
    prisma.drop.findUnique({ where: { id: dropId } }),
    prisma.subscriber.findMany({ where: { dropAlerts: true }, orderBy: { createdAt: "asc" } }),
    prisma.order.findMany({
      where: { dropId },
      select: { status: true, guestEmail: true, guestPhone: true, user: { select: { email: true, phone: true } } },
    }),
    getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || ""),
    optedOutSet(),
    getSiteSettings(),
  ]);
  if (!drop) return none;

  // Anyone who already ordered from this drop (by email or phone) is skipped
  const orderedEmails = new Set<string>();
  const orderedPhones = new Set<string>();
  for (const o of orders) {
    if (!countsStock(o.status)) continue;
    for (const e of [o.guestEmail, o.user?.email]) if (e) orderedEmails.add(e.toLowerCase());
    for (const p of [o.guestPhone, o.user?.phone]) if (phoneKey(p)) orderedPhones.add(phoneKey(p));
  }

  const shop = isOn(site.SITE_NAME_IN_NOTIFICATIONS) ? site.SITE_NAME : "";
  const dropUrl = `${appUrl}/drops/${drop.id}`;
  const closes = formatPickup(drop.orderCloseAt);
  const smsMessage =
    `${shop ? `${shop}: ` : ""}Last call! Orders for ${drop.title} close ${closes}. ${dropUrl} Reply STOP to opt out.`;

  const texts = new Set<string>();
  const emails: { email: string; unsubscribeUrl: string }[] = [];
  const emailed = new Set<string>();
  for (const s of subscribers) {
    const key = phoneKey(s.phone);
    const email = s.email?.toLowerCase() ?? null;
    if ((email && orderedEmails.has(email)) || (key && orderedPhones.has(key))) continue;
    // As each person chose; people from before the choice get a text, or an email if they have no phone
    const reach = channelsFor(s.dropVia, { hasEmail: !!email, canText: !!key && !optedOut.has(key) }, "textFirst");
    if (reach.text) texts.add(key);
    if (reach.email && email && !emailed.has(email)) {
      emailed.add(email);
      emails.push({ email, unsubscribeUrl: `${appUrl}/unsubscribe?token=${s.unsubscribeToken}` });
    }
  }
  if (!texts.size && !emails.length) return { sent: true, texts: 0, emails: 0 };

  const sent = await fireNotification("drop.reminder", {
    dropId: drop.id,
    title: drop.title,
    orderCloseAt: closes,
    // Texts expire then (SMS Gate validUntil), so a late "last call" never goes out
    orderCloseAtIso: drop.orderCloseAt.toISOString(),
    dropUrl,
    smsMessage,
    texts: [...texts].map((phone) => ({ phone })),
    emails,
  });
  if (!sent) {
    // n8n didn't take it: allow another try (the next background check, or the button)
    await prisma.drop.update({ where: { id: dropId }, data: { reminderSentAt: null } });
    return none;
  }
  if (texts.size) {
    await prisma.smsMessage.createMany({
      data: [...texts].map((phone) => ({ phone, direction: "OUT", body: smsMessage, read: true })),
    });
  }
  return { sent: true, texts: texts.size, emails: emails.length };
}

/** Background check (every minute): remind for drops closing within the set number of hours. */
export async function remindDueDrops(): Promise<void> {
  const { enabled, hours } = await reminderSettings();
  if (!enabled) return;
  const now = new Date();
  const due = await prisma.drop.findMany({
    where: {
      status: "OPEN",
      reminderSentAt: null,
      orderOpenAt: { lte: now },
      orderCloseAt: { gt: now, lte: new Date(now.getTime() + hours * 3600_000) },
    },
    select: { id: true },
  });
  for (const d of due) await remindDrop(d.id);
}
