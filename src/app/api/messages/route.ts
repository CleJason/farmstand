import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { phoneKey } from "@/lib/phone";
import { fireNotification } from "@/lib/notifications";
import { isOptedOut } from "@/lib/sms-opt-out";
import { ignoredNumbers, setIgnored } from "@/lib/sms-ignore";

/** Who each number belongs to, from customer records, accounts and orders. */
async function namesByPhone(): Promise<Map<string, string>> {
  const [contacts, users, orders] = await Promise.all([
    prisma.contact.findMany({ where: { name: { not: null } }, select: { name: true, phone: true, otherPhones: true } }),
    prisma.user.findMany({ where: { name: { not: null }, phone: { not: null } }, select: { name: true, phone: true } }),
    prisma.order.findMany({
      where: { guestName: { not: null }, guestPhone: { not: null } },
      select: { guestName: true, guestPhone: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const names = new Map<string, string>();
  for (const o of orders) if (phoneKey(o.guestPhone)) names.set(phoneKey(o.guestPhone), o.guestName!);
  for (const u of users) if (phoneKey(u.phone)) names.set(phoneKey(u.phone), u.name!);
  for (const c of contacts) for (const p of [c.phone, ...c.otherPhones]) if (phoneKey(p)) names.set(phoneKey(p), c.name!);
  return names;
}

/**
 * Admin → Messages. Without ?phone: the conversation list (newest first, with
 * unread counts). With ?phone: that conversation, which also marks it read.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const phone = phoneKey(new URL(req.url).searchParams.get("phone"));

  if (phone) {
    await prisma.smsMessage.updateMany({ where: { phone, direction: "IN", read: false }, data: { read: true } });
    const [messages, names, optedOut] = await Promise.all([
      prisma.smsMessage.findMany({ where: { phone }, orderBy: { createdAt: "asc" }, take: 500 }),
      namesByPhone(),
      isOptedOut(phone),
    ]);
    return NextResponse.json({ phone, name: names.get(phone) ?? null, optedOut, messages });
  }

  const [all, names, ignored] = await Promise.all([
    prisma.smsMessage.findMany({ orderBy: { createdAt: "desc" }, take: 5000 }),
    namesByPhone(),
    ignoredNumbers(),
  ]);
  // ?ignored=1: the numbers kept out of the inbox, for "Stop ignoring"
  if (new URL(req.url).searchParams.get("ignored")) {
    return NextResponse.json([...ignored].map((p) => ({ phone: p, name: names.get(p) ?? null })));
  }
  const threads = new Map<string, { phone: string; name: string | null; last: (typeof all)[number]; unread: number }>();
  for (const m of all) {
    if (ignored.has(m.phone)) continue;
    const t = threads.get(m.phone) ?? { phone: m.phone, name: names.get(m.phone) ?? null, last: m, unread: 0 };
    if (m.direction === "IN" && !m.read) t.unread++;
    threads.set(m.phone, t);
  }
  return NextResponse.json([...threads.values()]);
}

/**
 * Delete a conversation (?phone=) from Admin → Messages. Only the copies here:
 * texts on the phones aren't touched, and a STOP stays in effect.
 */
export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const phone = phoneKey(new URL(req.url).searchParams.get("phone"));
  if (!phone) return NextResponse.json({ error: "Missing phone" }, { status: 400 });
  const { count } = await prisma.smsMessage.deleteMany({ where: { phone } });
  return NextResponse.json({ ok: true, deleted: count });
}

/** `{ phone, ignore }`: keep a number out of Messages (its thread is cleared), or let it back in. */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const phone = phoneKey(String(data.phone ?? ""));
  if (!phone) return NextResponse.json({ error: "Missing phone" }, { status: 400 });
  await setIgnored(phone, data.ignore !== false);
  if (data.ignore !== false) await prisma.smsMessage.deleteMany({ where: { phone } });
  return NextResponse.json({ ok: true });
}

/** Reply (or start a text) to a number. Sent through n8n → SMS Gate. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const phone = phoneKey(String(data.phone ?? ""));
  const body = String(data.body ?? "").trim().slice(0, 1000);
  if (!phone) return NextResponse.json({ error: "That phone number doesn't look right" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "Type a message" }, { status: 400 });
  if (await isOptedOut(phone)) {
    return NextResponse.json({ error: "They replied STOP, so they can't be texted unless they reply START" }, { status: 400 });
  }

  const e164 = phone.length === 10 ? `+1${phone}` : `+${phone}`;
  const sent = await fireNotification("sms.send", { phone: e164, message: body });
  if (!sent) {
    return NextResponse.json({ error: "Couldn't reach the texting service (check n8n is running and published)" }, { status: 502 });
  }
  const message = await prisma.smsMessage.create({ data: { phone, direction: "OUT", body, read: true } });
  return NextResponse.json(message);
}
