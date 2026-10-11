import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { phoneKey } from "@/lib/phone";

async function isAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

/** The drop-alert list, for the admin only. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [subscribers, contacts, users, orders] = await Promise.all([
    prisma.subscriber.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, phone: true, createdAt: true },
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

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  // ?all=1 empties the whole list (e.g. before re-importing a cleaned-up file)
  if (params.get("all") === "1") {
    const { count } = await prisma.subscriber.deleteMany({});
    return NextResponse.json({ ok: true, removed: count });
  }
  const id = params.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await prisma.subscriber.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
