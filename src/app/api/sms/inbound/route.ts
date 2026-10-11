import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { phoneKey } from "@/lib/phone";
import { keywordAction } from "@/lib/sms-opt-out";

/**
 * n8n forwards every text that comes in to the SMS Gate phone here (with the
 * shared webhook secret). STOP-type replies opt the number out of all texts
 * and take it off Drop Alerts; START opts it back in. The reply tells n8n
 * whether to send the carrier-required confirmation text.
 */
export async function POST(req: Request) {
  const secret = await getSetting("N8N_WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { phone, text } = await req.json().catch(() => ({}));
  const key = phoneKey(String(phone ?? ""));
  const action = keywordAction(String(text ?? ""));
  if (!key || !action) return NextResponse.json({ action: "none" });

  if (action === "stop") {
    await prisma.smsOptOut.upsert({ where: { phone: key }, update: {}, create: { phone: key } });
    // Phone-only alert subscribers come off the list; email ones keep getting emails
    const subs = await prisma.subscriber.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true, email: true } });
    const mine = subs.filter((s) => phoneKey(s.phone) === key);
    await prisma.subscriber.deleteMany({ where: { id: { in: mine.filter((s) => !s.email).map((s) => s.id) } } });
    return NextResponse.json({ action: "stop" });
  }

  await prisma.smsOptOut.deleteMany({ where: { phone: key } });
  return NextResponse.json({ action: "start" });
}
