import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mergeSubscribers } from "@/lib/subscribers";

/** Two Drop Alerts entries for one person: `keepId` stays, with anything `otherId` adds. */
export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const keepId = String(data.keepId ?? "");
  const otherId = String(data.otherId ?? "");
  if (!keepId || !otherId || keepId === otherId) return NextResponse.json({ error: "Choose two different entries" }, { status: 400 });
  const merged = await mergeSubscribers(keepId, otherId);
  if (!merged) return NextResponse.json({ error: "One of those entries is gone. Refresh and try again." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
