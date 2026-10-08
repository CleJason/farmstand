import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { notifyGiftActivated } from "@/lib/gift-notify";

type Params = { params: Promise<{ id: string }> };

/**
 * Admin changes: set the balance (e.g. a cash top-up or correction), void /
 * reactivate, or resend the gift email.
 */
export async function PUT(req: Request, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const card = await prisma.giftCertificate.findUnique({ where: { id } });
  if (!card) return NextResponse.json({ error: "Gift card not found" }, { status: 404 });

  if (body.resend) {
    if (card.status !== "ACTIVE") return NextResponse.json({ error: "Only active gift cards can be sent" }, { status: 400 });
    if (!card.recipientEmail) return NextResponse.json({ error: "Add a recipient email first" }, { status: 400 });
    await notifyGiftActivated(card);
    return NextResponse.json(card);
  }

  const data: { balance?: number; status?: string; recipientEmail?: string | null } = {};
  if (body.balance !== undefined) {
    const balance = Math.round(Number(body.balance));
    if (!Number.isInteger(balance) || balance < 0) {
      return NextResponse.json({ error: "Balance can't be negative" }, { status: 400 });
    }
    data.balance = balance;
  }
  if (body.status === "VOID" || body.status === "ACTIVE") {
    if (body.status === "ACTIVE" && card.status === "PENDING") {
      return NextResponse.json({ error: "This card activates when its order is marked paid" }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.recipientEmail !== undefined) data.recipientEmail = String(body.recipientEmail).trim() || null;

  const updated = await prisma.giftCertificate.update({ where: { id }, data });
  return NextResponse.json(updated);
}
