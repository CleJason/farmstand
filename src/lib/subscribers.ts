import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/phone";

export type AlertList = "drop" | "stand";
export type AlertVia = "text" | "email" | "both";

/** Names by email and phone, from what we know about people elsewhere: customer records, accounts, orders. */
export async function knownNames() {
  const [contacts, users, orders] = await Promise.all([
    prisma.contact.findMany({ where: { name: { not: null } }, select: { name: true, email: true, phone: true, otherEmails: true, otherPhones: true } }),
    prisma.user.findMany({ where: { name: { not: null } }, select: { name: true, email: true, phone: true } }),
    prisma.order.findMany({
      where: { guestName: { not: null } },
      select: { guestName: true, guestEmail: true, guestPhone: true },
      orderBy: { createdAt: "asc" }, // later orders overwrite, so the newest name wins
    }),
  ]);
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const note = (name: string | null, emails: (string | null)[], phones: (string | null)[]) => {
    if (!name) return;
    for (const e of emails) if (e) byEmail.set(e.toLowerCase(), name);
    for (const p of phones) if (phoneKey(p)) byPhone.set(phoneKey(p), name);
  };
  for (const o of orders) note(o.guestName, [o.guestEmail], [o.guestPhone]);
  for (const u of users) note(u.name, [u.email], [u.phone]);
  for (const c of contacts) note(c.name, [c.email, ...c.otherEmails], [c.phone, ...c.otherPhones]);
  return { byEmail, byPhone };
}

/** How someone gets walk-up alerts, from what they gave: a phone means text, an email means email. */
export function viaFor(phone: string | null, email: string | null, asked?: unknown): AlertVia {
  if (asked === "text" || asked === "email" || asked === "both") return asked;
  return phone && email ? "both" : phone ? "text" : "email";
}

/**
 * Which way(s) to reach someone, from their choice. If they picked texts but
 * can't get them (replied STOP), they get the email instead, and the other way
 * around. `legacy` is for people who signed up before there was a choice:
 * "both" = email plus a text if they have a phone; "textFirst" = a text, or an
 * email if they have no phone.
 */
export function channelsFor(
  via: string | null | undefined,
  { hasEmail, canText }: { hasEmail: boolean; canText: boolean },
  legacy: "both" | "textFirst"
): { text: boolean; email: boolean } {
  const choice = via === "text" || via === "email" || via === "both" ? via : legacy === "both" ? "both" : "text";
  const text = canText && (choice !== "email" || !hasEmail);
  const email = hasEmail && (choice !== "text" || !canText);
  return { text, email };
}

/**
 * Make two entries one: the first keeps its details and gains what the other
 * adds, with the earlier sign-up date. If one got texts and the other emails,
 * they now get both. Returns false if either is gone.
 */
export async function mergeSubscribers(keepId: string, otherId: string): Promise<boolean> {
  const [keep, other] = await Promise.all([
    prisma.subscriber.findUnique({ where: { id: keepId } }),
    prisma.subscriber.findUnique({ where: { id: otherId } }),
  ]);
  if (!keep || !other) return false;
  const via = (a: string | null, b: string | null) => (a && b && a !== b ? "both" : a ?? b);
  await prisma.$transaction([
    prisma.subscriber.delete({ where: { id: other.id } }),
    prisma.subscriber.update({
      where: { id: keep.id },
      data: {
        email: keep.email ?? other.email,
        phone: keep.phone ?? other.phone,
        createdAt: other.createdAt < keep.createdAt ? other.createdAt : keep.createdAt,
        dropAlerts: keep.dropAlerts || other.dropAlerts,
        standAlerts: keep.standAlerts || other.standAlerts,
        dropVia: via(keep.dropVia, other.dropVia),
        standVia: via(keep.standVia, other.standVia) ?? keep.standVia,
      },
    }),
  ]);
  return true;
}

/** Every entry matching these emails or numbers becomes one, the earliest. */
export async function mergeSubscribersFor(emails: string[], phones: string[]) {
  const all = await prisma.subscriber.findMany({ orderBy: { createdAt: "asc" } });
  const matches = all.filter((s) => (s.email && emails.includes(s.email)) || (s.phone && phones.includes(phoneKey(s.phone))));
  for (const other of matches.slice(1)) await mergeSubscribers(matches[0].id, other.id);
}

/**
 * Add someone to the subscriber list. There's one list: signing up on the home
 * page or the Porch Pickup page gets drop alerts and Porch Pickup notices
 * (`list` is only where they signed up). The same email, or the same phone for
 * phone-only people (even when they come back and add an email), is one
 * subscriber. Email/phone must already be cleaned
 * (cleanEmail/cleanPhone). `via` is how they want them (text, email or both).
 */
export async function addSubscriber({
  email,
  phone,
  list,
  via,
}: {
  email: string | null;
  phone: string | null;
  list: AlertList;
  via?: AlertVia;
}) {
  // Home-page sign-ups from before the Text/Email/Both choice send no `via` (left empty: email plus a text)
  const choice = via ?? (list === "stand" ? viaFor(phone, email) : undefined);
  const flag = { dropAlerts: true, standAlerts: true, ...(choice ? { dropVia: choice, standVia: choice } : {}) };
  if (email) {
    // Signing up again is a fresh yes, even after unsubscribing
    await prisma.emailOptOut.deleteMany({ where: { email } });
    // They're already on the list by phone alone: add the email to that entry instead of a second one
    const phoneOnly = phone
      ? (await prisma.subscriber.findMany({ where: { email: null, phone: { not: null } } })).find((s) => phoneKey(s.phone) === phoneKey(phone))
      : undefined;
    if (phoneOnly) {
      const same = await prisma.subscriber.findUnique({ where: { email } });
      if (same) {
        // On the list twice already: keep the email entry, from when they first signed up
        const createdAt = phoneOnly.createdAt < same.createdAt ? phoneOnly.createdAt : same.createdAt;
        await prisma.$transaction([
          prisma.subscriber.delete({ where: { id: phoneOnly.id } }),
          prisma.subscriber.update({ where: { id: same.id }, data: { ...flag, phone, createdAt } }),
        ]);
      } else {
        await prisma.subscriber.update({ where: { id: phoneOnly.id }, data: { ...flag, email, phone } });
      }
      return;
    }
    await prisma.subscriber.upsert({
      where: { email },
      create: { email, phone, ...flag },
      update: { ...flag, ...(phone ? { phone } : {}) },
    });
    return;
  }
  if (!phone) return;
  // Phone only: the same number already on the list just gets updated
  const withPhone = await prisma.subscriber.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true } });
  const existing = withPhone.find((s) => phoneKey(s.phone) === phoneKey(phone));
  if (existing) await prisma.subscriber.update({ where: { id: existing.id }, data: flag });
  else await prisma.subscriber.create({ data: { phone, ...flag } });
}
