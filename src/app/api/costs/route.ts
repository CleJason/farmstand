import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { loadCosts } from "@/lib/costs-data";

export const dynamic = "force-dynamic";

/** Admin → Costs: ingredients, purchases and recipes with their costs worked out. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await loadCosts());
}

/** Settings: `overheadRate` ($ per hour of bake/labor time) and `basis` ("average" or "latest" prices). */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const updates: [string, string][] = [];
  if (data.overheadRate !== undefined) {
    const rate = Number(data.overheadRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1000) {
      return NextResponse.json({ error: "The hourly rate should be a dollar amount" }, { status: 400 });
    }
    updates.push(["COST_OVERHEAD_RATE", String(rate)]);
  }
  if (data.basis !== undefined) updates.push(["COST_PRICE_BASIS", data.basis === "latest" ? "latest" : "average"]);
  for (const [key, value] of updates) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  return NextResponse.json(await loadCosts());
}
