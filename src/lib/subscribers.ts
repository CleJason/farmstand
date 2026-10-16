import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/phone";

export type AlertList = "drop" | "stand";
export type AlertVia = "text" | "email" | "both";

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
 * Add someone to the subscriber list. There's one list: signing up on the home
 * page or the Porch Pickup page gets drop alerts and Porch Pickup notices
 * (`list` is only where they signed up). The same email, or the same phone for
 * phone-only people, is one subscriber. Email/phone must already be cleaned
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
