import { NextResponse } from "next/server";
import { COPY } from "@/lib/copy";

/** The list of editable storefront wording (Admin → Site → Text & buttons), for the Android app. */
export async function GET() {
  return NextResponse.json(
    Object.entries(COPY).map(([key, e]) => ({ key, group: e.group, label: e.label, default: e.default, long: "long" in e && !!e.long }))
  );
}
