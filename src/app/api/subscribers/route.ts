import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { phoneKey } from "@/lib/phone";
import { cleanEmail, cleanPhone } from "@/lib/drop-alerts";
import { addSubscriber, type AlertList } from "@/lib/subscribers";

/** Where someone was added from (?list=stand = Porch Pickup); it's all one list. */
const listOf = (v: unknown): AlertList => (v === "stand" ? "stand" : "drop");

async function isAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

/** Everyone subscribed (drop alerts and Porch Pickup notices), for the admin only. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [subscribers, contacts, users, orders] = await Promise.all([
    prisma.subscriber.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, phone: true, createdAt: true, dropVia: true, standVia: true },
    }),
    prisma.contact.findMany({ where: { name: { not: null } }, select: { name: true, email: true, phone: true, otherEmails: true, otherPhones: true } }),
    prisma.user.findMany({ where: { name: { not: null } }, select: { name: true, email: true, phone: true } }),
    prisma.order.findMany({
      where: { guestName: { not: null } },
      select: { guestName: true, guestEmail: true, guestPhone: true },
      orderBy: { createdAt: "asc" }, // later orders overwrite, so the newest name wins
    }),
  ]);

  // Names come from what we know about them elsewhere: customer records, accounts, orders
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const note = (name: string | null, emails: (string | null)[], phones: (string | null)[]) => {
    if (!name) return;
    for (const e of emails) if (e) byEmail.set(e.toLowerCase(), name);
    for (const p of phones) if (phoneKey(p)) byPhone.set(phoneKey(p), name);
  };
  for (const o of orders) note(o.guestName, [o.guestEmail], [o.guestPhone]);
  for (const u of users) note(u.name, [u.email], [u.phone]);
  for (const c of contacts) note(c.name, [c.email, ...c.otherEmails], [c.phone, ...c.otherPhones]);

  return NextResponse.json(
    subscribers.map((s) => ({
      ...s,
      name: (s.email && byEmail.get(s.email)) || (s.phone && byPhone.get(phoneKey(s.phone))) || null,
    }))
  );
}

/** Add someone by hand (email, phone, or both). Same email again just updates the phone. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const email = data.email ? cleanEmail(data.email) : null;
  const phone = data.phone ? cleanPhone(data.phone) : null;
  if (data.email && !email) return NextResponse.json({ error: "That email doesn't look right" }, { status: 400 });
  if (data.phone && !phone) return NextResponse.json({ error: "That phone number doesn't look right" }, { status: 400 });
  if (!email && !phone) return NextResponse.json({ error: "Add an email, a phone number, or both" }, { status: 400 });

  await addSubscriber({ email, phone, list: listOf(data.list) });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  // One list: removing someone stops drop alerts and Porch Pickup notices
  const id = params.get("id");
  // ?all=1 empties the whole list (e.g. before re-importing a cleaned-up file)
  const scope = params.get("all") === "1" ? {} : id ? { id } : null;
  if (!scope) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { count: removed } = await prisma.subscriber.deleteMany({ where: scope });
  return NextResponse.json({ ok: true, removed });
}
