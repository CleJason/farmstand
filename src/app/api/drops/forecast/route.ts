import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dropForecasts } from "@/lib/drop-forecast";

/** Each drop's potential revenue and profit, for the admin only. */
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await dropForecasts());
}
