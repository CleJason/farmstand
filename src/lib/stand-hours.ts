import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { fireNotification } from "@/lib/notifications";
import { formatPickup } from "@/lib/pickup";
import { phoneKey } from "@/lib/phone";
import { optedOutSet } from "@/lib/sms-opt-out";
import { getSiteSettings, isOn, standHref } from "@/lib/site";

/** Upcoming (or happening now) Porch Pickup open hours, soonest first. */
export function upcomingStandHours() {
  return prisma.standHours.findMany({ where: { endsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" } });
}

/** "Sat, Oct 18, 9:00 AM–2:00 PM" in the server's timezone, for texts and emails. */
export function formatHours(h: { startsAt: Date; endsAt: Date }) {
  const end = h.endsAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: process.env.TZ || undefined,
  });
  return `${formatPickup(h.startsAt)}–${end}`;
}

/**
 * Admin → Porch Pickup → "Notify the Porch Pickup list": one text per number
 * (email for people without a phone) listing the upcoming open hours.
 */
export async function notifyStandList(): Promise<{ sent: boolean; texts: number; emails: number; error?: string }> {
  const hours = await upcomingStandHours();
  if (!hours.length) return { sent: false, texts: 0, emails: 0, error: "Add the open days and times first" };

  const [subscribers, optedOut, site, appUrl] = await Promise.all([
    prisma.subscriber.findMany({ where: { standAlerts: true }, orderBy: { createdAt: "asc" } }),
    optedOutSet(),
    getSiteSettings(),
    getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || ""),
  ]);
  const shop = isOn(site.SITE_NAME_IN_NOTIFICATIONS) ? site.SITE_NAME : "";
  const name = site.SITE_FARMSTAND_HEADING;
  const url = `${appUrl.replace(/\/+$/, "")}${standHref(site)}`;
  const when = hours.map(formatHours);
  const smsMessage = `${shop ? `${shop}: ` : ""}${name} is open ${when.join("; ")}. ${url} Reply STOP to opt out.`;

  const texts = new Set<string>();
  const emails: { email: string; unsubscribeUrl: string }[] = [];
  const emailed = new Set<string>();
  for (const s of subscribers) {
    // Each person picked text, email or both; someone who replied STOP gets the email instead
    const key = phoneKey(s.phone);
    const canText = !!key && !optedOut.has(key);
    const wantsText = s.standVia !== "email";
    const wantsEmail = s.standVia !== "text";
    if (wantsText && canText) texts.add(key);
    if (s.email && !emailed.has(s.email) && (wantsEmail || !canText)) {
      emailed.add(s.email);
      emails.push({ email: s.email, unsubscribeUrl: `${appUrl}/unsubscribe?token=${s.unsubscribeToken}` });
    }
  }
  if (!texts.size && !emails.length) return { sent: false, texts: 0, emails: 0, error: "Nobody is on the Porch Pickup list yet" };

  const sent = await fireNotification("broadcast", {
    smsMessage,
    texts: [...texts].map((phone) => ({ phone })),
    emails,
    emailSubject: `${shop ? `${shop}: ` : ""}${name} is open`,
    emailHeading: `${name} is open!`,
    emailLines: when,
    buttonText: `Visit ${name}`,
    buttonUrl: url,
    // Texts that can't go out before the last open window ends are dropped
    validUntil: hours[hours.length - 1].endsAt.toISOString(),
  });
  if (!sent) return { sent: false, texts: 0, emails: 0, error: "Couldn't send it. Check that n8n is running and the workflow is published." };
  if (texts.size) {
    await prisma.smsMessage.createMany({
      data: [...texts].map((phone) => ({ phone, direction: "OUT", body: smsMessage, read: true })),
    });
  }
  return { sent: true, texts: texts.size, emails: emails.length };
}
