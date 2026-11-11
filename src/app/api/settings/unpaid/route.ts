import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { unpaidCancelHours } from "@/lib/unpaid-orders";

/** How many hours an unpaid Venmo/PayPal order waits before it cancels itself (0 = never). */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ hours: await unpaidCancelHours() });
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hours = Number((await req.json().catch(() => ({}))).hours);
  if (!Number.isInteger(hours) || hours < 0 || hours > 720) {
    return NextResponse.json({ error: "Hours must be a whole number from 0 to 720" }, { status: 400 });
  }
  await prisma.setting.upsert({
    where: { key: "UNPAID_CANCEL_HOURS" },
    update: { value: String(hours) },
    create: { key: "UNPAID_CANCEL_HOURS", value: String(hours) },
  });
  return NextResponse.json({ hours });
}
