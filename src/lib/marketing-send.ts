import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fireNotification } from "@/lib/notifications";
import { nextTextingTime } from "@/lib/text-hours";

/** Show the texts in Admin → Messages, like any other text the shop sends. */
async function logTexts(body: string | null, phones: string[]) {
  if (!body || !phones.length) return;
  await prisma.smsMessage
    .createMany({ data: phones.map((phone) => ({ phone, direction: "OUT", body, read: true })) })
    .catch((err) => console.error("[marketing] Couldn't save the texts to Messages:", err));
}

/**
 * A marketing message (bulk message, Porch Pickup notice) to n8n now, or, when
 * it has texts and it's outside texting hours, queued until the hours start.
 * `sent` is true once n8n took it or it's queued.
 */
export async function sendMarketing(
  event: "broadcast",
  payload: Record<string, unknown>,
  sms: { body: string; phones: string[] }
): Promise<{ sent: boolean; scheduledFor?: string }> {
  const now = new Date();
  const at = sms.phones.length ? await nextTextingTime(now) : now;
  if (at > now) {
    await prisma.scheduledSend.create({
      data: { event, payload: payload as Prisma.InputJsonValue, smsBody: sms.body, smsPhones: sms.phones, sendAt: at },
    });
    return { sent: true, scheduledFor: at.toISOString() };
  }
  const sent = await fireNotification(event, payload);
  if (sent) await logTexts(sms.body, sms.phones);
  return { sent };
}

/** Background check (every minute): send queued messages whose time has come. */
export async function sendScheduled(): Promise<void> {
  const due = await prisma.scheduledSend.findMany({ where: { sentAt: null, sendAt: { lte: new Date() } }, orderBy: { sendAt: "asc" } });
  for (const s of due) {
    const { count } = await prisma.scheduledSend.updateMany({ where: { id: s.id, sentAt: null }, data: { sentAt: new Date() } });
    if (count !== 1) continue;
    const sent = await fireNotification(s.event as "broadcast", s.payload as Record<string, unknown>);
    if (!sent) {
      // n8n didn't take it: try again next minute
      await prisma.scheduledSend.update({ where: { id: s.id }, data: { sentAt: null } });
      continue;
    }
    await logTexts(s.smsBody, s.smsPhones);
  }
}
