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
 * Put someone on an alert list (drop alerts or Porch Pickup alerts). The same
 * email, or the same phone for phone-only people, is one subscriber who can be
 * on both lists. Email/phone must already be cleaned (cleanEmail/cleanPhone).
 * `via` is how they want walk-up alerts (text, email or both).
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
  const flag = list === "drop" ? { dropAlerts: true } : { standAlerts: true, standVia: via ?? viaFor(phone, email) };
  const lists = { dropAlerts: list === "drop", standAlerts: list === "stand" };
  if (email) {
    await prisma.subscriber.upsert({
      where: { email },
      create: { email, phone, ...lists, ...(list === "stand" ? flag : {}) },
      update: { ...flag, ...(phone ? { phone } : {}) },
    });
    return;
  }
  if (!phone) return;
  // Phone only: the same number already on a list just gets this list added
  const withPhone = await prisma.subscriber.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true } });
  const existing = withPhone.find((s) => phoneKey(s.phone) === phoneKey(phone));
  if (existing) await prisma.subscriber.update({ where: { id: existing.id }, data: flag });
  else await prisma.subscriber.create({ data: { phone, ...lists, ...(list === "stand" ? flag : {}) } });
}
