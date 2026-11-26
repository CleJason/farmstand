import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { pickupReminderHours } from "@/lib/pickup-reminders";

/** How many hours before pickup the reminder text goes out (0 = off). */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ hours: await pickupReminderHours() });
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hours = Number((await req.json().catch(() => ({}))).hours);
  if (!Number.isInteger(hours) || hours < 0 || hours > 48) {
    return NextResponse.json({ error: "Hours must be a whole number from 0 to 48" }, { status: 400 });
  }
  await prisma.setting.upsert({
    where: { key: "PICKUP_REMINDER_HOURS" },
    update: { value: String(hours) },
    create: { key: "PICKUP_REMINDER_HOURS", value: String(hours) },
  });
  return NextResponse.json({ hours });
}