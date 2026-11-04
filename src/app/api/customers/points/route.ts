import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { phoneKey } from "@/lib/phone";

async function isAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

/** Add or take off points by hand: `email` and/or `phone`, `points` (+/-), `reason`. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const email = String(data.email ?? "").trim().toLowerCase() || null;
  const phone = phoneKey(String(data.phone ?? "")) || null;
  const points = Number(data.points);
  const reason = String(data.reason ?? "").trim().slice(0, 200);
  if (!email && !phone) return NextResponse.json({ error: "This customer has no email or phone" }, { status: 400 });
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 100000) {
    return NextResponse.json({ error: "Enter a whole number of points, like 20 or -20" }, { status: 400 });
  }
  if (!reason) return NextResponse.json({ error: "Add a reason, like \"cash sale $20\"" }, { status: 400 });
  const adjustment = await prisma.pointsAdjustment.create({ data: { email, phone, points, reason } });
  return NextResponse.json(adjustment);
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await prisma.pointsAdjustment.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
