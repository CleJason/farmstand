import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { phoneKey } from "@/lib/phone";
import { cleanEmail } from "@/lib/drop-alerts";

// Orders that represent a real purchase (not abandoned card checkouts or cancellations)
const COUNTED = ["AWAITING_CONFIRM", "PAID", "READY", "PICKED_UP"];

export type CustomerOrder = {
  id: string;
  createdAt: string;
  type: string;
  status: string;
  paymentMethod: string;
  total: number;
};

export type Customer = {
  key: string;
  kind: "account" | "guest" | "added"; // added = entered/imported by the owner
  name: string | null;
  email: string | null;
  phone: string | null;
  signedUpAt: string | null;
  orderCount: number;
  totalSpent: number; // cents, counted orders only
  lastOrderAt: string | null;
  orders: CustomerOrder[];
};

/**
 * Everyone who has signed up or ordered. Accounts are keyed by user id; guest
 * checkouts are grouped by email (or phone when there's no email). A guest
 * whose email matches an account is merged into that account.
 */
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [users, orders, contacts] = await Promise.all([
    prisma.user.findMany({ where: { role: { not: "ADMIN" } } }),
    prisma.order.findMany({
      select: {
        id: true,
        createdAt: true,
        type: true,
        status: true,
        paymentMethod: true,
        total: true,
        userId: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        user: { select: { role: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contact.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  const customers = new Map<string, Customer>();
  const accountByEmail = new Map<string, string>();

  for (const u of users) {
    const key = `user:${u.id}`;
    accountByEmail.set(u.email.toLowerCase(), key);
    customers.set(key, {
      key,
      kind: "account",
      name: u.name,
      email: u.email,
      phone: u.phone,
      signedUpAt: u.createdAt.toISOString(),
      orderCount: 0,
      totalSpent: 0,
      lastOrderAt: null,
      orders: [],
    });
  }

  for (const o of orders) {
    if (o.user?.role === "ADMIN") continue; // the owner's own test orders

    const email = o.guestEmail?.trim().toLowerCase() || null;
    const phone = phoneKey(o.guestPhone) || null;
    let key: string | null = null;
    if (o.userId) key = `user:${o.userId}`;
    else if (email) key = accountByEmail.get(email) ?? `email:${email}`;
    else if (phone) key = `phone:${phone}`;
    if (!key) continue; // anonymous walk-up purchase with no contact info

    let c = customers.get(key);
    if (!c) {
      c = {
        key,
        kind: "guest",
        name: o.guestName, // newest order first, so their latest name
        email,
        phone: o.guestPhone,
        signedUpAt: null,
        orderCount: 0,
        totalSpent: 0,
        lastOrderAt: null,
        orders: [],
      };
      customers.set(key, c);
    }
    if (!c.phone && o.guestPhone) c.phone = o.guestPhone;
    if (!c.name && o.guestName) c.name = o.guestName;

    c.orders.push({
      id: o.id,
      createdAt: o.createdAt.toISOString(),
      type: o.type,
      status: o.status,
      paymentMethod: o.paymentMethod,
      total: o.total,
    });
    if (COUNTED.includes(o.status)) {
      c.orderCount += 1;
      c.totalSpent += o.total;
    }
    c.lastOrderAt ??= o.createdAt.toISOString(); // orders are newest first
  }

  // Customers the owner added or imported: merged into whoever matches by email or phone
  const byPhone = new Map<string, string>();
  for (const [key, c] of customers) {
    const p = phoneKey(c.phone);
    if (p) byPhone.set(p, key);
  }
  for (const ct of contacts) {
    const key =
      (ct.email && (accountByEmail.get(ct.email) ?? (customers.has(`email:${ct.email}`) ? `email:${ct.email}` : null))) ||
      (ct.phone && byPhone.get(ct.phone)) ||
      (ct.email ? `email:${ct.email}` : `phone:${ct.phone}`);
    const c = customers.get(key);
    if (c) {
      // What the owner entered wins over what was typed at checkout
      c.name = ct.name ?? c.name;
      c.email ??= ct.email;
      c.phone = ct.phone ?? c.phone;
      c.signedUpAt ??= ct.createdAt.toISOString();
    } else {
      customers.set(key, {
        key,
        kind: "added",
        name: ct.name,
        email: ct.email,
        phone: ct.phone,
        signedUpAt: ct.createdAt.toISOString(),
        orderCount: 0,
        totalSpent: 0,
        lastOrderAt: null,
        orders: [],
      });
      if (ct.phone) byPhone.set(ct.phone, key);
    }
  }

  const list = [...customers.values()].sort((a, b) =>
    (b.lastOrderAt ?? b.signedUpAt ?? "").localeCompare(a.lastOrderAt ?? a.signedUpAt ?? "")
  );
  return NextResponse.json(list);
}

/**
 * Edit a customer's name and phone (and add an email if they have none).
 * Accounts are updated directly; anyone else gets an owner-entered record
 * that overrides what was typed at checkout. Past orders keep what was
 * entered then, but stay under the same customer (grouped by email).
 */
export async function PATCH(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const [kind, ...rest] = key.split(":");
  const value = rest.join(":");
  const data = await req.json().catch(() => ({}));
  const name = String(data.name ?? "").trim().slice(0, 100) || null;
  const phoneRaw = String(data.phone ?? "").trim();
  const phone = phoneRaw ? phoneKey(phoneRaw) : "";
  if (phoneRaw && !phone) return NextResponse.json({ error: "That phone number doesn't look right" }, { status: 400 });
  const newEmail = data.email ? cleanEmail(data.email) : null;
  if (data.email && !newEmail) return NextResponse.json({ error: "That email doesn't look right" }, { status: 400 });

  if (kind === "user") {
    const user = await prisma.user.findUnique({ where: { id: value } });
    if (!user) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    await prisma.user.update({ where: { id: user.id }, data: { name, phone: phone || null } });
    // An owner-entered record would override these, so keep it in step
    await prisma.contact.updateMany({ where: { email: user.email.toLowerCase() }, data: { name, phone: phone || null } });
    return NextResponse.json({ ok: true });
  }

  if (kind === "email") {
    await prisma.contact.upsert({
      where: { email: value },
      update: { name, phone: phone || null },
      create: { email: value, name, phone: phone || null },
    });
    return NextResponse.json({ ok: true });
  }

  if (kind === "phone") {
    // Phone-only customer: can also be given an email from here on
    const existing = await prisma.contact.findFirst({ where: { phone: value, email: null } });
    if (newEmail && (await prisma.contact.findUnique({ where: { email: newEmail } }))) {
      return NextResponse.json({ error: "Another customer already has that email" }, { status: 400 });
    }
    const fields = { name, phone: phone || value, email: newEmail };
    if (existing) await prisma.contact.update({ where: { id: existing.id }, data: fields });
    else await prisma.contact.create({ data: fields });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid customer" }, { status: 400 });
}

/**
 * Delete a customer: removes their account (if any) and their name, email and
 * phone from past orders. The orders themselves stay, so sales totals and
 * stock history are unchanged. ?key= is the customer's key from GET.
 */
export async function DELETE(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = new URL(req.url).searchParams.get("key") ?? "";
  const [kind, ...rest] = key.split(":");
  const value = rest.join(":");
  if (!value) return NextResponse.json({ error: "Missing customer" }, { status: 400 });

  const anonymize = { guestName: null, guestEmail: null, guestPhone: null, notes: null };

  if (kind === "user") {
    const user = await prisma.user.findUnique({ where: { id: value } });
    if (!user) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    if (user.role === "ADMIN") {
      return NextResponse.json({ error: "Admins can't be deleted here" }, { status: 400 });
    }
    await prisma.$transaction([
      prisma.order.updateMany({
        where: { OR: [{ userId: user.id }, { guestEmail: { equals: user.email, mode: "insensitive" } }] },
        data: { ...anonymize, userId: null },
      }),
      prisma.user.delete({ where: { id: user.id } }), // sessions/accounts cascade
      prisma.contact.deleteMany({ where: { email: user.email.toLowerCase() } }),
    ]);
  } else if (kind === "email") {
    await prisma.$transaction([
      prisma.order.updateMany({
        where: { userId: null, guestEmail: { equals: value, mode: "insensitive" } },
        data: anonymize,
      }),
      prisma.contact.deleteMany({ where: { email: value } }),
    ]);
  } else if (kind === "phone") {
    // Phones were grouped by digits only, so match on that
    const orders = await prisma.order.findMany({
      where: { userId: null, guestEmail: null, guestPhone: { not: null } },
      select: { id: true, guestPhone: true },
    });
    const ids = orders.filter((o) => phoneKey(o.guestPhone) === value).map((o) => o.id);
    await prisma.$transaction([
      prisma.order.updateMany({ where: { id: { in: ids } }, data: anonymize }),
      prisma.contact.deleteMany({ where: { phone: value } }),
    ]);
  } else {
    return NextResponse.json({ error: "Invalid customer" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
