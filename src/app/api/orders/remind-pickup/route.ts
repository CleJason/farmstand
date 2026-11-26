import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-input";
import { remindMissedPickups } from "@/lib/pickup-reminders";

/** "Send pickup reminder": `ids` of orders still waiting to be picked up. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const ids = Array.isArray(data.ids) ? data.ids.map(String) : [];
  if (!ids.length) return NextResponse.json({ error: "No orders picked" }, { status: 400 });
  return NextResponse.json(await remindMissedPickups(ids));
}