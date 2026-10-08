import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Which build is running (git commit), for checking an update actually applied. */
export function GET() {
  return NextResponse.json({ ok: true, version: process.env.APP_VERSION || "dev" });
}
