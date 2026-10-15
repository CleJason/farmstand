import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/phone";

export type AlertList = "drop" | "stand";

/**
 * Put someone on an alert list (drop alerts or Porch Pickup alerts). The same
 * email, or the same phone for phone-only people, is one subscriber who can be
 * on both lists. Email/phone must already be cleaned (cleanEmail/cleanPhone).
 */
export async function addSubscriber({
  email,
  phone,
  list,
}: {
  email: string | null;
  phone: string | null;
  list: AlertList;
}) {
  const flag = list === "drop" ? { dropAlerts: true } : { standAlerts: true };
  if (email) {
    await prisma.subscriber.upsert({
      where: { email },
      create: { email, phone, dropAlerts: list === "drop", standAlerts: list === "stand" },
      update: { ...flag, ...(phone ? { phone } : {}) },
    });
    return;
  }
  if (!phone) return;
  // Phone only: the same number already on a list just gets this list added
  const withPhone = await prisma.subscriber.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true } });
  const existing = withPhone.find((s) => phoneKey(s.phone) === phoneKey(phone));
  if (existing) await prisma.subscriber.update({ where: { id: existing.id }, data: flag });
  else await prisma.subscriber.create({ data: { phone, dropAlerts: list === "drop", standAlerts: list === "stand" } });
}
