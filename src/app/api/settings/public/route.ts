import { NextResponse } from "next/server";
import { getPaymentSettings, getSetting } from "@/lib/settings";

export async function GET() {
  const settings = await getPaymentSettings();
  return NextResponse.json({
    appUrl: await getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || ""),
    hasStripe: settings.hasStripe,
    stripePublishableKey: settings.stripePublishable,
    paypalUsername: settings.paypalUsername,
    venmoUsername: settings.venmoUsername,
  });
}
