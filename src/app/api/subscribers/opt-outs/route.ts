import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { phoneKey } from "@/lib/phone";
import { cleanPhone } from "@/lib/drop-alerts";
import { optOut } from "@/lib/sms-opt-out";
import { knownNames } from "@/lib/subscribers";

async function isAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

/** Every number that can't be texted because it replied STOP or was marked by hand, newest first. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [optOuts, { byPhone }, subs] = await Promise.all([
    prisma.smsOptOut.findMany({ orderBy: { createdAt: "desc" } }),
    knownNames(),
    prisma.subscriber.findMany({ where: { phone: { not: null } }, select: { phone: true, email: true } }),
  ]);
  // Still getting drop alert emails: on the list with an email
  const emailing = new Set(subs.filter((s) => s.email).map((s) => phoneKey(s.phone)));
  return NextResponse.json(optOuts.map((o) => ({ ...o, name: byPhone.get(o.phone) ?? null, gettingEmails: emailing.has(o.phone) })));
}

/** "Mark as STOP": for a STOP seen on the phone that never reached the shop. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const phone = cleanPhone(data.phone);
  if (!phone) return NextResponse.json({ error: "That phone number doesn't look right" }, { status: 400 });
  await optOut(phoneKey(phone));
  return NextResponse.json({ ok: true });
}

/**
 * "Unsubscribe from emails too": someone who replied STOP and wants nothing.
 * They come off Drop Alerts, and their email is remembered so an import or
 * later sign-up can't quietly add it back.
 */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const phone = phoneKey(String((await req.json().catch(() => ({}))).phone ?? ""));
  if (!phone) return NextResponse.json({ error: "Missing phone" }, { status: 400 });
  const subs = (await prisma.subscriber.findMany({ where: { phone: { not: null } } })).filter((s) => phoneKey(s.phone) === phone);
  const emails = [...new Set(subs.map((s) => s.email?.trim().toLowerCase()).filter(Boolean))] as string[];
  await prisma.$transaction([
    ...emails.map((email) => prisma.emailOptOut.upsert({ where: { email }, create: { email }, update: {} })),
    prisma.subscriber.deleteMany({ where: { id: { in: subs.map((s) => s.id) } } }),
  ]);
  return NextResponse.json({ ok: true, removed: subs.length, emails });
}

/** Undo a number marked by mistake. A STOP in their Messages history opts them out again at the next restart. */
export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const phone = new URL(req.url).searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "Missing phone" }, { status: 400 });
  await prisma.smsOptOut.deleteMany({ where: { phone } });
  return NextResponse.json({ ok: true });
}
