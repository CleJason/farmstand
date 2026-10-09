import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { reviewSettings } from "@/lib/review-requests";

/** How often customers are asked for a review, and the first-review thank-you discount. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await reviewSettings());
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const days = Number(data.days);
  const percent = Number(data.percent);
  if (!Number.isInteger(days) || days < 0 || days > 365) {
    return NextResponse.json({ error: "Days must be a whole number from 0 to 365" }, { status: 400 });
  }
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    return NextResponse.json({ error: "Discount must be 0 to 100%" }, { status: 400 });
  }
  for (const [key, value] of [
    ["REVIEW_REQUEST_DAYS", String(days)],
    ["REVIEW_REWARD_PERCENT", String(percent)],
  ]) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  return NextResponse.json(await reviewSettings());
}
