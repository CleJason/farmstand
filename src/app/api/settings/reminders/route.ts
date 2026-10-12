import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { reminderSettings } from "@/lib/drop-reminders";

/** The "closing soon" reminder: on/off and how many hours before ordering closes. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await reminderSettings());
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const hours = Number(data.hours);
  if (!Number.isInteger(hours) || hours < 1 || hours > 72) {
    return NextResponse.json({ error: "Hours must be a whole number from 1 to 72" }, { status: 400 });
  }
  for (const [key, value] of [
    ["DROP_REMINDER_ENABLED", data.enabled === false ? "false" : "true"],
    ["DROP_REMINDER_HOURS", String(hours)],
  ]) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  return NextResponse.json(await reminderSettings());
}
