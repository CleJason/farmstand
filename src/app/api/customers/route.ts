import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

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
  kind: "account" | "guest";
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

  const [users, orders] = await Promise.all([
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
        guestEmail: true,
        guestPhone: true,
        user: { select: { role: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
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
    const phone = o.guestPhone?.replace(/[^\d+]/g, "") || null;
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
        name: null,
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

  const list = [...customers.values()].sort((a, b) =>
    (b.lastOrderAt ?? b.signedUpAt ?? "").localeCompare(a.lastOrderAt ?? a.signedUpAt ?? "")
  );
  return NextResponse.json(list);
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

  const anonymize = { guestEmail: null, guestPhone: null, notes: null };

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
    ]);
  } else if (kind === "email") {
    await prisma.order.updateMany({
      where: { userId: null, guestEmail: { equals: value, mode: "insensitive" } },
      data: anonymize,
    });
  } else if (kind === "phone") {
    // Phones were grouped by digits only, so match on that
    const orders = await prisma.order.findMany({
      where: { userId: null, guestEmail: null, guestPhone: { not: null } },
      select: { id: true, guestPhone: true },
    });
    const ids = orders.filter((o) => o.guestPhone?.replace(/[^\d+]/g, "") === value).map((o) => o.id);
    await prisma.order.updateMany({ where: { id: { in: ids } }, data: anonymize });
  } else {
    return NextResponse.json({ error: "Invalid customer" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
