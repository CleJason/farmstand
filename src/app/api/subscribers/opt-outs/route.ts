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
  const [optOuts, { byPhone }] = await Promise.all([
    prisma.smsOptOut.findMany({ orderBy: { createdAt: "desc" } }),
    knownNames(),
  ]);
  return NextResponse.json(optOuts.map((o) => ({ ...o, name: byPhone.get(o.phone) ?? null })));
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

/** Undo a number marked by mistake. A STOP in their Messages history opts them out again at the next restart. */
export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const phone = new URL(req.url).searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "Missing phone" }, { status: 400 });
  await prisma.smsOptOut.deleteMany({ where: { phone } });
  return NextResponse.json({ ok: true });
}
