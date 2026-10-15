import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-input";
import { notifyStandList } from "@/lib/stand-hours";

/** Admin → Porch Pickup → "Notify the Porch Pickup list" (texts, or email when there's no phone). */
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await notifyStandList();
  if (!result.sent) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
