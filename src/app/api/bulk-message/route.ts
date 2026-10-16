import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-input";
import { bulkMessage, recentDrops } from "@/lib/bulk-message";

export const dynamic = "force-dynamic";

/** Recent drops, for "skip people who ordered from…". Admin only. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await recentDrops());
}

/**
 * Admin → Bulk Message. `{ message, subject?, skipDropId?, confirm }`:
 * without `confirm: true` it only counts who would get it.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const result = await bulkMessage({
    message: String(body.message ?? ""),
    subject: String(body.subject ?? ""),
    skipDropId: body.skipDropId ? String(body.skipDropId) : null,
    send: body.confirm === true,
  });
  if (result.error) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
