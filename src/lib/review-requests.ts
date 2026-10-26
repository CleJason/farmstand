import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { fireNotification } from "@/lib/notifications";
import { phoneKey } from "@/lib/phone";
import { isOptedOut } from "@/lib/sms-opt-out";
import { getSiteSettings, isOn } from "@/lib/site";
import { sendMarketing } from "@/lib/marketing-send";

/**
 * Customer reviews: after an order is picked up, the customer may get a
 * "How was it?" email with a private link, and a text if they gave only a
 * phone or chose texts (texts-only people get just the text). Not every order asks: a customer
 * is asked at most once every REVIEW_REQUEST_DAYS days. Their first review
 * earns a single-use REVIEW_REWARD_PERCENT% code (0 turns that off).
 */

export async function reviewSettings() {
  const [days, percent] = await Promise.all([
    getSetting("REVIEW_REQUEST_DAYS", "30"),
    getSetting("REVIEW_REWARD_PERCENT", "10"),
  ]);
  return {
    days: Math.max(0, Math.round(Number(days) || 0)),
    percent: Math.min(100, Math.max(0, Math.round(Number(percent) || 0))),
  };
}

type NamedItems = {
  dropProduct: { product: { name: string } } | null;
  farmstandItem: { name: string } | null;
  name?: string | null;
}[];

/** The product names on an order (boxes by their product name), each once. */
export function orderProductNames(items: NamedItems): string[] {
  const names = items.map((i) => i.dropProduct?.product.name ?? i.farmstandItem?.name ?? i.name).filter(Boolean) as string[];
  return [...new Set(names)];
}

export async function hasReviewed(email: string) {
  return (await prisma.review.count({ where: { email } })) > 0;
}

// No 0/O/1/I so codes are easy to read and type
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateRewardCode() {
  const chars = Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `THANKS-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Called when an order is marked Picked Up. Sends the review link if this customer is due one. */
export async function maybeRequestReview(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: true,
      items: { include: { dropProduct: { include: { product: true } }, farmstandItem: true } },
    },
  });
  if (!order || order.type === "GIFT" || order.reviewToken) return;
  const email = (order.guestEmail || order.user?.email || "").trim().toLowerCase();
  const phone = phoneKey(order.guestPhone || order.user?.phone);
  if (!email && !phone) return;

  const { days, percent } = await reviewSettings();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // They asked not to be asked for reviews
  if (email && (await prisma.reviewOptOut.findUnique({ where: { email } }))) return;

  // Asked (by email or text) or reviewed recently: not this time
  const asked = await prisma.order.findMany({
    where: { reviewRequestedAt: { gte: since } },
    select: { guestEmail: true, guestPhone: true, user: { select: { email: true, phone: true } } },
  });
  const same = (o: (typeof asked)[number]) =>
    (email && [o.guestEmail, o.user?.email].some((e) => e?.trim().toLowerCase() === email)) ||
    (phone && [o.guestPhone, o.user?.phone].some((p) => phoneKey(p) === phone));
  if (asked.some(same)) return;
  if (email && (await prisma.review.count({ where: { email, createdAt: { gte: since } } }))) return;

  // A text too when they gave only a phone, or chose texts for alerts (never after STOP)
  const subs = await prisma.subscriber.findMany({ where: { OR: [...(email ? [{ email }] : []), { phone: { not: null } }] } });
  const sub = subs.find((s) => (email && s.email === email) || (phone && phoneKey(s.phone) === phone));
  const text = !!phone && !(await isOptedOut(phone)) && (!email || sub?.dropVia === "text" || sub?.dropVia === "both");
  // Someone who chose texts only gets just the text
  const sendEmail = !!email && !(text && sub?.dropVia === "text");

  const token = crypto.randomBytes(18).toString("base64url");
  await prisma.order.update({ where: { id: order.id }, data: { reviewToken: token, reviewRequestedAt: new Date() } });

  const appUrl = await getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || "");
  const reviewUrl = `${appUrl}/review?token=${token}`;
  const reward = email && (await hasReviewed(email)) ? 0 : percent;
  const products = orderProductNames(order.items);
  if (sendEmail) {
    await fireNotification("review.requested", {
      orderId: order.id,
      customerEmail: email,
      customerName: order.user?.name ?? null,
      products,
      reviewUrl,
      // "Don't ask me for reviews" link at the bottom of the email
      optOutUrl: `${appUrl}/review/stop?token=${token}`,
      // Offered only on their first review
      rewardPercent: reward,
    });
  }
  if (text) {
    const site = await getSiteSettings();
    const shop = isOn(site.SITE_NAME_IN_NOTIFICATIONS) ? site.SITE_NAME : "";
    // "your Biscoff Cookie", but "The Sunday Roll" as is
    const what = products.length !== 1 ? "your order" : /^the\s/i.test(products[0]) ? products[0] : `your ${products[0]}`;
    const smsMessage =
      `${shop ? `${shop}: ` : ""}Thanks for picking up! How was ${what}? Leave a quick review: ${reviewUrl}` +
      `${reward ? ` Your first review gets ${reward}% off your next order.` : ""} Reply STOP to opt out.`;
    // Waits for texting hours, like other texts that aren't about an order
    await sendMarketing("broadcast", { smsMessage, texts: [{ phone }], emails: [] }, { body: smsMessage, phones: [phone] });
  }
}
