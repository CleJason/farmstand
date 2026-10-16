import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-input";
import { notifyStandList } from "@/lib/stand-hours";

/**
 * Admin → Porch Pickup → "Notify subscribers". `{ skipDropId?, confirm }`:
 * without `confirm: true` it only counts who would get it.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const result = await notifyStandList({
    skipDropId: body.skipDropId ? String(body.skipDropId) : null,
    send: body.confirm === true,
  });
  if (result.error) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
