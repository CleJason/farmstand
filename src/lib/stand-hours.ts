import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { sendMarketing } from "@/lib/marketing-send";
import { formatPickup } from "@/lib/pickup";
import { getSiteSettings, isOn, standHref } from "@/lib/site";
import { recipients, sendCounts, type SendResult } from "@/lib/bulk-message";

/** Upcoming (or happening now) Porch Pickup open hours, soonest first. */
export function upcomingStandHours() {
  return prisma.standHours.findMany({ where: { endsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" } });
}

/**
 * When Porch Pickup opens next, if open hours are set and none has started
 * yet: until then items stay hidden from customers (so they can be set up
 * ahead). null = open now, or no hours set (items show whenever they're out).
 */
export async function standClosedUntil(now = new Date()): Promise<Date | null> {
  const hours = await upcomingStandHours();
  if (!hours.length || hours.some((h) => h.startsAt <= now)) return null;
  return hours[0].startsAt;
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
 * Admin → Porch Pickup → "Notify subscribers": the upcoming open hours to every
 * subscriber, or everyone except people who ordered from `skipDropId` (this
 * week's drop). Each gets it the way they chose; people from before the choice
 * get a text, or an email if they have no phone. `send: false` only counts.
 */
export async function notifyStandList({
  skipDropId,
  send,
}: {
  skipDropId?: string | null;
  send: boolean;
}): Promise<SendResult> {
  const hours = await upcomingStandHours();
  const none = { sent: false, people: 0, texts: 0, emails: 0, skipped: 0 };
  if (!hours.length) return { ...none, error: "Add the open days and times first" };

  const [to, site, appUrl] = await Promise.all([
    recipients({ skipDropId, legacy: "textFirst" }),
    getSiteSettings(),
    getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || ""),
  ]);
  const counts = sendCounts(to);
  if (!send) return { sent: false, ...counts };
  if (!to.people) return { sent: false, ...counts, error: "Nobody to send it to" };
  const shop = isOn(site.SITE_NAME_IN_NOTIFICATIONS) ? site.SITE_NAME : "";
  const name = site.SITE_FARMSTAND_HEADING;
  const url = `${appUrl.replace(/\/+$/, "")}${standHref(site)}`;
  const when = hours.map(formatHours);
  const smsMessage = `${shop ? `${shop}: ` : ""}${name} is open ${when.join("; ")}. ${url} Reply STOP to opt out.`;

  // Outside texting hours it waits until they start
  const { sent, scheduledFor } = await sendMarketing(
    "broadcast",
    {
      smsMessage,
      texts: to.texts.map((phone) => ({ phone })),
      emails: to.emails,
      emailSubject: `${shop ? `${shop}: ` : ""}${name} is open`,
      emailHeading: `${name} is open!`,
      emailLines: when,
      buttonText: `Visit ${name}`,
      buttonUrl: url,
      // Texts that can't go out before the last open window ends are dropped
      validUntil: hours[hours.length - 1].endsAt.toISOString(),
    },
    { body: smsMessage, phones: to.texts }
  );
  if (!sent) return { sent: false, ...counts, error: "Couldn't send it. Check that n8n is running and the workflow is published." };
  return { sent: true, ...counts, scheduledFor };
}
