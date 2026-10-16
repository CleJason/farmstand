import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { fireNotification } from "@/lib/notifications";
import { phoneKey } from "@/lib/phone";
import { optedOutSet } from "@/lib/sms-opt-out";
import { getSiteSettings, isOn } from "@/lib/site";
import { countsStock } from "@/lib/stock";
import { channelsFor } from "@/lib/subscribers";

export const MAX_MESSAGE = 1000;

export type SendBy = "choice" | "text" | "email";

/** Recent published drops, newest first, for "skip people who ordered from…". */
export function recentDrops() {
  return prisma.drop.findMany({
    where: { status: { not: "DRAFT" }, orderOpenAt: { lte: new Date() } },
    orderBy: { orderOpenAt: "desc" },
    take: 8,
    select: { id: true, title: true, orderOpenAt: true, orderCloseAt: true },
  });
}

/**
 * Who gets a message sent to the whole subscriber list, optionally skipping
 * people who ordered from a drop (by email or phone). `by: "choice"` = the
 * way each person chose (text, email or both; STOP means email instead);
 * "text" / "email" = only that way, to everyone who can get it. `legacy` is
 * for people who signed up before there was a choice (see channelsFor). One
 * text per number, one email per address.
 */
export async function recipients({
  skipDropId,
  by = "choice",
  legacy,
}: {
  skipDropId?: string | null;
  by?: SendBy;
  legacy: "both" | "textFirst";
}) {
  const [subscribers, optedOut, appUrl, orders, contacts] = await Promise.all([
    prisma.subscriber.findMany({ orderBy: { createdAt: "asc" } }),
    optedOutSet(),
    getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || ""),
    skipDropId
      ? prisma.order.findMany({
          where: { dropId: skipDropId },
          orderBy: { createdAt: "asc" },
          select: {
            status: true,
            guestName: true,
            guestEmail: true,
            guestPhone: true,
            user: { select: { name: true, email: true, phone: true } },
          },
        })
      : Promise.resolve([]),
    skipDropId
      ? prisma.contact.findMany({ select: { email: true, phone: true, otherEmails: true, otherPhones: true } })
      : Promise.resolve([]),
  ]);

  // Each order's customer, by every email/phone we know for them (customer
  // records keep older ones), so someone who signed up with their phone but
  // ordered with their email is still left out
  const orderers = orders
    .filter((o) => countsStock(o.status))
    .map((o) => {
      const emails = new Set([o.guestEmail, o.user?.email].filter(Boolean).map((e) => e!.toLowerCase()));
      const phones = new Set([o.guestPhone, o.user?.phone].map(phoneKey).filter(Boolean));
      for (const c of contacts) {
        const cEmails = [c.email, ...c.otherEmails].filter(Boolean).map((e) => e!.toLowerCase());
        const cPhones = [c.phone, ...c.otherPhones].map(phoneKey).filter(Boolean);
        if (cEmails.some((e) => emails.has(e)) || cPhones.some((p) => phones.has(p))) {
          cEmails.forEach((e) => emails.add(e));
          cPhones.forEach((p) => phones.add(p));
        }
      }
      return { name: o.guestName || o.user?.name || o.guestEmail || o.user?.email || o.guestPhone || "Someone", emails, phones, matched: false };
    });
  const orderedBy = (email: string | null, key: string) =>
    orderers.filter((o) => (email && o.emails.has(email)) || (key && o.phones.has(key)));

  const texts = new Set<string>();
  const emails: { email: string; unsubscribeUrl: string }[] = [];
  const emailed = new Set<string>();
  let people = 0;
  let skipped = 0;
  for (const s of subscribers) {
    const key = phoneKey(s.phone);
    const email = s.email?.toLowerCase() ?? null;
    const ordered = orderedBy(email, key);
    if (ordered.length) {
      ordered.forEach((o) => (o.matched = true));
      skipped++;
      continue;
    }
    const canText = !!key && !optedOut.has(key);
    const reach =
      by === "text"
        ? { text: canText, email: false }
        : by === "email"
          ? { text: false, email: !!email }
          : channelsFor(s.dropVia, { hasEmail: !!email, canText }, legacy);
    let reached = false;
    if (reach.text && !texts.has(key)) {
      texts.add(key);
      reached = true;
    }
    if (reach.email && email && !emailed.has(email)) {
      emailed.add(email);
      emails.push({ email, unsubscribeUrl: `${appUrl}/unsubscribe?token=${s.unsubscribeToken}` });
      reached = true;
    }
    if (reached) people++;
  }
  // Who ordered from that drop, and whether they were on the list (to show before sending)
  const orderList = orderers.map((o) => ({ name: o.name, subscribed: o.matched }));
  return { texts: [...texts], emails, people, skipped, orders: orderList };
}

export type SendResult = {
  sent: boolean;
  people: number;
  texts: number;
  emails: number;
  skipped: number;
  orders?: { name: string; subscribed: boolean }[];
  error?: string;
};

/** What the confirm step shows. */
export const sendCounts = (to: Awaited<ReturnType<typeof recipients>>) => ({
  people: to.people,
  texts: to.texts.length,
  emails: to.emails.length,
  skipped: to.skipped,
  orders: to.orders,
});

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Admin → Bulk Message: one message to every subscriber, optionally skipping
 * people who ordered from a drop. `send: false` only counts who'd get it, for
 * the confirm step.
 */
export async function bulkMessage({
  message,
  subject,
  skipDropId,
  by = "choice",
  send,
}: {
  message: string;
  subject?: string;
  skipDropId?: string | null;
  by?: SendBy;
  send: boolean;
}): Promise<SendResult> {
  const text = message.trim();
  const empty = { sent: false, people: 0, texts: 0, emails: 0, skipped: 0 };
  if (send && !text) return { ...empty, error: "Write the message first" };
  if (text.length > MAX_MESSAGE) return { ...empty, error: `Keep it under ${MAX_MESSAGE} characters` };

  const [to, site, appUrl] = await Promise.all([
    recipients({ skipDropId, by, legacy: "both" }),
    getSiteSettings(),
    getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || ""),
  ]);
  const counts = sendCounts(to);
  if (!send) return { sent: false, ...counts };
  if (!to.people) return { sent: false, ...counts, error: "Nobody to send it to" };

  const shop = isOn(site.SITE_NAME_IN_NOTIFICATIONS) ? site.SITE_NAME : "";
  // "…first come first serve" + "." so the opt-out reads as its own sentence
  const ended = /[.!?)"']$/.test(text) ? text : `${text}.`;
  const smsMessage = `${shop ? `${shop}: ` : ""}${/\bSTOP\b/.test(text) ? text : `${ended} Reply STOP to opt out.`}`;
  const heading = subject?.trim().slice(0, 150) || (shop ? `News from ${shop}` : "News from us");
  const homeUrl = appUrl.replace(/\/+$/, "");

  const sent = await fireNotification("broadcast", {
    smsMessage,
    texts: to.texts.map((phone) => ({ phone })),
    emails: to.emails,
    emailSubject: heading,
    emailHeading: escapeHtml(heading),
    // n8n puts these into the email as-is, one per line
    emailLines: text.split(/\r?\n/).map(escapeHtml),
    buttonText: homeUrl ? `Visit ${escapeHtml(site.SITE_NAME || "the shop")}` : "",
    buttonUrl: homeUrl,
  });
  if (!sent) return { sent: false, ...counts, error: "Couldn't send it. Check that n8n is running and the workflow is published." };
  if (to.texts.length) {
    await prisma.smsMessage.createMany({
      data: to.texts.map((phone) => ({ phone, direction: "OUT", body: smsMessage, read: true })),
    });
  }
  return { sent: true, ...counts };
}
