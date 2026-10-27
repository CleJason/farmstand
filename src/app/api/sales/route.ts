import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-input";
import { accounting } from "@/lib/accounting";

export const dynamic = "force-dynamic";

/** Admin → Sales: every sale from `from` to `to` (YYYY-MM-DD, both included), this shop's and imported. */
export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const year = new Date().getFullYear();
  // A day either side, then trimmed to the shop's days below (orders are stored in UTC)
  const fromDay = params.get("from") || `${year}-01-01`;
  const toDay = params.get("to") || `${year}-12-31`;
  const from = new Date(new Date(`${fromDay}T00:00:00Z`).getTime() - 86400000);
  const to = new Date(new Date(`${toDay}T00:00:00Z`).getTime() + 2 * 86400000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return NextResponse.json({ error: "Bad dates" }, { status: 400 });
  const { sales } = await accounting(from, to);
  return NextResponse.json(sales.filter((s) => s.date >= fromDay && s.date <= toDay));
}
