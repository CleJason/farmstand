import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { generateGiftCode } from "@/lib/gift";
import { notifyGiftActivated } from "@/lib/gift-notify";

/** All gift cards (admin). */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cards = await prisma.giftCertificate.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(cards);
}

/** Owner-created gift card (sold in person, comps, giveaways) — active immediately. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const amount = Math.round(Number(body.amount));
  if (!Number.isInteger(amount) || amount < 1) {
    return NextResponse.json({ error: "Enter the gift card amount" }, { status: 400 });
  }
  const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;
  const card = await prisma.giftCertificate.create({
    data: {
      code: generateGiftCode(),
      initialAmount: amount,
      balance: amount,
      status: "ACTIVE",
      recipientName: clean(body.recipientName, 100),
      recipientEmail: clean(body.recipientEmail, 200),
      fromName: clean(body.fromName, 100),
      message: clean(body.message, 500),
    },
  });
  // Only email it out when asked (owner may hand over a printed code instead)
  if (body.sendEmail && card.recipientEmail) await notifyGiftActivated(card);
  return NextResponse.json(card);
}
