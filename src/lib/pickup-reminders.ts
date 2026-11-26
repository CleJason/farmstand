import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { fireNotification } from "@/lib/notifications";
import { phoneKey } from "@/lib/phone";
import { isOptedOut } from "@/lib/sms-opt-out";
import { getSiteSettings, isOn } from "@/lib/site";
import { sendShopEmail } from "@/lib/send-email";
import { pickupAddressFor } from "@/lib/pickup";

/**
 * Pickup reminders: a text (or an email when there's no number to text) a
 * set number of hours before each paid order's pickup time, so nobody
 * forgets. Sent once per order. On by default, 3 hours before (0 = off).
 */
export async function pickupReminderHours(): Promise<number> {
  const n = Math.round(Number(await getSetting("PICKUP_REMINDER_HOURS", "3")));
  return Number.isFinite(n) && n >= 0 && n <= 48 ? n : 3;
}

const timeOf = (d: Date) =>
  d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: process.env.TZ || "America/New_York" });
const dayOf = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", timeZone: process.env.TZ || "America/New_York" });
const sameDay = (a: Date, b: Date) => dayOf(a) === dayOf(b) && Math.abs(a.getTime() - b.getTime()) < 86_400_000;

/** Background job (every minute): remind paid orders whose pickup is coming up. */
export async function sendPickupReminders() {
  const hours = await pickupReminderHours();
  if (!hours) return;
  const now = new Date();
  const until = new Date(now.getTime() + hours * 3600_000);
  const orders = await prisma.order.findMany({
    where: {
      type: "DROP",
      status: { in: ["PAID", "READY"] },
      pickupReminderAt: null,
      OR: [
        { pickupTime: { gt: now, lte: until } },
        // No chosen time: the window's start
        { pickupTime: null, pickupSlot: { pickupDate: { gt: now, lte: until } } },
      ],
    },
    include: { user: true, pickupSlot: true },
    take: 20,
  });
  if (!orders.length) return;
  const site = await getSiteSettings();
  const shop = isOn(site.SITE_NAME_IN_NOTIFICATIONS) ? site.SITE_NAME : "";

  for (const o of orders) {
    // Marked first, so a slow send never repeats
    const claimed = await prisma.order.updateMany({ where: { id: o.id, pickupReminderAt: null }, data: { pickupReminderAt: now } });
    if (!claimed.count) continue;
    const at = o.pickupTime ?? o.pickupSlot?.pickupDate;
    if (!at) continue;
    const no = o.id.slice(-6).toUpperCase();
    const first = (o.guestName || o.user?.name || "").split(" ")[0];
    const when = `${sameDay(at, now) ? "today" : dayOf(at)} at ${timeOf(at)}`;
    const where = pickupAddressFor(o.pickupSlot, site);
    const body =
      `Hi${first ? ` ${first}` : ""}! Reminder: your order #${no} is ready for pickup ${when}` +
      `${where ? ` at ${where}` : ""}. Reply here if you need a different time. See you soon!`;

    const phone = phoneKey(o.guestPhone || o.user?.phone);
    const email = (o.guestEmail || o.user?.email || "").trim();
    try {
      if (phone && !(await isOptedOut(phone))) {
        const message = `${shop ? `${shop}: ` : ""}${body}`;
        const e164 = phone.length === 10 ? `+1${phone}` : `+${phone}`;
        if (await fireNotification("sms.send", { phone: e164, message })) {
          await prisma.smsMessage.create({ data: { phone, direction: "OUT", body: message, read: true } });
          continue;
        }
      }
      // No number to text (or STOP): email instead
      if (email) await sendShopEmail({ to: email, subject: `${shop || "Your order"}: pickup reminder #${no}`, text: body });
    } catch (e) {
      console.error("[pickup-reminders] Couldn't send", o.id, e);
    }
  }
}
