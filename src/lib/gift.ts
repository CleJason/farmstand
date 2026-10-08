import crypto from "crypto";
import type { GiftCertificate, Prisma } from "@prisma/client";

export class GiftError extends Error {}

// No 0/O/1/I so codes are easy to read off a card
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateGiftCode() {
  const bytes = crypto.randomBytes(8);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `GIFT-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

export const normalizeGiftCode = (code: unknown) =>
  String(code ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

/** How much of `amountDue` an active gift card can cover. */
export async function evaluateGift(
  db: Prisma.TransactionClient,
  rawCode: unknown,
  amountDue: number
): Promise<{ gift: GiftCertificate; amount: number }> {
  const gift = await db.giftCertificate.findUnique({ where: { code: normalizeGiftCode(rawCode) } });
  if (!gift || gift.status !== "ACTIVE") throw new GiftError("That gift card code isn't valid");
  if (gift.balance <= 0) throw new GiftError("That gift card has no balance left");
  return { gift, amount: Math.min(gift.balance, Math.max(0, amountDue)) };
}

/** Spend (1) or refund (-1) the part of an order paid by gift card. */
export async function adjustGiftBalance(
  tx: Prisma.TransactionClient,
  code: string | null | undefined,
  amount: number,
  direction: 1 | -1
) {
  if (!code || amount <= 0) return;
  await tx.giftCertificate.updateMany({
    where: { code },
    data: { balance: { increment: -direction * amount } },
  });
}
