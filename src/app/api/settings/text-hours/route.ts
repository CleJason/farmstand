import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { textHours } from "@/lib/text-hours";

/** Texting hours for drop alerts, reminders, bulk messages and Porch Pickup notices. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await textHours());
}

/** `enabled`, `start` and `end` ("09:00", 24-hour). */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const time = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!time.test(String(data.start)) || !time.test(String(data.end)) || data.start === data.end) {
    return NextResponse.json({ error: "Pick a start and end time" }, { status: 400 });
  }
  for (const [key, value] of [
    ["TEXT_HOURS_ENABLED", data.enabled === false ? "false" : "true"],
    ["TEXT_HOURS_START", String(data.start)],
    ["TEXT_HOURS_END", String(data.end)],
  ]) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  return NextResponse.json(await textHours());
}
