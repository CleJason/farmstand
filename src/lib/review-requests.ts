import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { fireNotification } from "@/lib/notifications";

/**
 * Customer reviews: after an order is picked up, the customer may get a
 * "How was it?" email with a private link. Not every order asks: a customer
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
}[];

/** The product names on an order (boxes by their product name), each once. */
export function orderProductNames(items: NamedItems): string[] {
  const names = items.map((i) => i.dropProduct?.product.name ?? i.farmstandItem?.name).filter(Boolean) as string[];
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
  if (!email) return;

  const { days, percent } = await reviewSettings();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [recentlyAsked, recentlyReviewed, reviewedBefore] = await Promise.all([
    prisma.order.count({
      where: {
        reviewRequestedAt: { gte: since },
        OR: [
          { guestEmail: { equals: email, mode: "insensitive" } },
          { user: { email: { equals: email, mode: "insensitive" } } },
        ],
      },
    }),
    prisma.review.count({ where: { email, createdAt: { gte: since } } }),
    hasReviewed(email),
  ]);
  if (recentlyAsked > 0 || recentlyReviewed > 0) return;

  const token = crypto.randomBytes(18).toString("base64url");
  await prisma.order.update({ where: { id: order.id }, data: { reviewToken: token, reviewRequestedAt: new Date() } });

  const appUrl = await getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || "");
  await fireNotification("review.requested", {
    orderId: order.id,
    customerEmail: email,
    customerName: order.user?.name ?? null,
    products: orderProductNames(order.items),
    reviewUrl: `${appUrl}/review?token=${token}`,
    // Offered only on their first review
    rewardPercent: reviewedBefore ? 0 : percent,
  });
}
