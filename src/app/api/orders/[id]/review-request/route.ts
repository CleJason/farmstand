import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-input";
import { maybeRequestReview } from "@/lib/review-requests";

/**
 * Admin → Orders → "Ask for a review": send this order's review link now (email
 * and/or text, as for Picked Up), even if they were asked in the last 30 days.
 * "Don't ask me" and STOP still count.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await maybeRequestReview(id, { force: true });
  if (!result.sent) return NextResponse.json({ error: result.reason ?? "Couldn't send it" }, { status: 400 });
  return NextResponse.json(result);
}
