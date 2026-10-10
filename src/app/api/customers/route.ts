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
  previousEmails: string[];
  previousPhones: string[];
  contactId: string | null; // the owner-entered record for this customer, if any
  signedUpAt: string | null;
  orderCount: number;
  totalSpent: number; // cents, counted orders only
  lastOrderAt: string | null;
  orders: CustomerOrder[];
};

async function requireAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

const blank = (key: string, kind: Customer["kind"]): Customer => ({
  key,
  kind,
  name: null,
  email: null,
  phone: null,
  previousEmails: [],
  previousPhones: [],
  contactId: null,
  signedUpAt: null,
  orderCount: 0,
  totalSpent: 0,
  lastOrderAt: null,
  orders: [],
});

/**
 * Everyone who has signed up, ordered, or been added by the owner. Accounts
 * are keyed by user id; guest checkouts are grouped by email (or phone when
 * there's no email). Owner-entered records (Contact) carry a customer's
 * current details plus their old emails/numbers, and pull every order made
 * with any of them into one customer.
 */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const index = (key: string, email: string | null | undefined, phone: string | null | undefined) => {
    if (email && !byEmail.has(email)) byEmail.set(email, key);
    const p = phoneKey(phone);
    if (p && !byPhone.has(p)) byPhone.set(p, key);
  };

  for (const u of users) {
    const key = `user:${u.id}`;
    customers.set(key, {
      ...blank(key, "account"),
      name: u.name,
      email: u.email,
      phone: u.phone,
      signedUpAt: u.createdAt.toISOString(),
    });
    index(key, u.email.toLowerCase(), u.phone);
  }

  for (const o of orders) {
    if (o.user?.role === "ADMIN") continue; // the owner's own test orders

    const email = o.guestEmail?.trim().toLowerCase() || null;
    const phone = phoneKey(o.guestPhone) || null;
    let key: string | null = null;
    if (o.userId) key = `user:${o.userId}`;
    else if (email) key = byEmail.get(email) ?? `email:${email}`;
    else if (phone) key = byPhone.get(phone) ?? `phone:${phone}`;
    if (!key) continue; // anonymous walk-up purchase with no contact info

    let c = customers.get(key);
    if (!c) {
      // Newest order first, so these are their latest details
      c = { ...blank(key, "guest"), name: o.guestName, email, phone: o.guestPhone };
      customers.set(key, c);
    }
    if (!c.phone && o.guestPhone) c.phone = o.guestPhone;
    if (!c.name && o.guestName) c.name = o.guestName;
    index(key, email, o.guestPhone);

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
    c.lastOrderAt ??= o.createdAt.toISOString();
  }

  // Owner-entered records: join everyone matching any of their emails/numbers
  for (const ct of contacts) {
    const emails = [ct.email, ...ct.otherEmails].filter(Boolean) as string[];
    const phones = [ct.phone, ...ct.otherPhones].filter(Boolean) as string[];
    const keys = [
      ...new Set(
        [...emails.map((e) => byEmail.get(e)), ...phones.map((p) => byPhone.get(p))].filter(
          (k): k is string => !!k && customers.has(k)
        )
      ),
    ];

    let target: Customer;
    if (keys.length === 0) {
      target = { ...blank(`contact:${ct.id}`, "added"), signedUpAt: ct.createdAt.toISOString() };
      customers.set(target.key, target);
    } else {
      // Keep an account if there is one; fold the rest into it
      const main = keys.find((k) => k.startsWith("user:")) ?? keys[0];
      target = customers.get(main)!;
      for (const k of keys) {
        if (k === main) continue;
        const other = customers.get(k)!;
        target.orders.push(...other.orders);
        target.orderCount += other.orderCount;
        target.totalSpent += other.totalSpent;
        if ((other.lastOrderAt ?? "") > (target.lastOrderAt ?? "")) target.lastOrderAt = other.lastOrderAt;
        target.name ??= other.name;
        customers.delete(k);
      }
      target.orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      target.signedUpAt ??= ct.createdAt.toISOString();
    }
    // What the owner entered wins over what was typed at checkout
    target.contactId = ct.id;
    target.name = ct.name ?? target.name;
    target.email = ct.email ?? target.email;
    target.phone = ct.phone ?? target.phone;
    target.previousEmails = ct.otherEmails;
    target.previousPhones = ct.otherPhones;
    for (const e of emails) byEmail.set(e, target.key);
    for (const p of phones) byPhone.set(p, target.key);
  }

  const list = [...customers.values()].sort((a, b) =>
    (b.lastOrderAt ?? b.signedUpAt ?? "").localeCompare(a.lastOrderAt ?? a.signedUpAt ?? "")
  );
  return NextResponse.json(list);
}

const uniq = (list: (string | null | undefined)[], except: (string | null)[]) =>
  [...new Set(list.filter((v): v is string => !!v && !except.includes(v)))];

/**
 * Edit a customer's name, email and phone. When the email or number changes,
 * the old one is kept on their profile, so orders placed with it (and any
 * future ones) stay with this customer. Accounts also get the new details,
 * including the email they sign in with.
 */
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const [kind, ...rest] = key.split(":");
  const value = rest.join(":");
  const data = await req.json().catch(() => ({}));

  const name = String(data.name ?? "").trim().slice(0, 100) || null;
  const phoneRaw = String(data.phone ?? "").trim();
  const newPhone = phoneRaw ? phoneKey(phoneRaw) : null;
  if (phoneRaw && !newPhone) return NextResponse.json({ error: "That phone number doesn't look right" }, { status: 400 });
  const emailRaw = String(data.email ?? "").trim();
  const newEmail = emailRaw ? cleanEmail(emailRaw) : null;
  if (emailRaw && !newEmail) return NextResponse.json({ error: "That email doesn't look right" }, { status: 400 });

  let contact = data.contactId ? await prisma.contact.findUnique({ where: { id: String(data.contactId) } }) : null;
  const user = kind === "user" ? await prisma.user.findUnique({ where: { id: value } }) : null;
  if (kind === "user" && !user) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  // Their details before this edit
  const oldEmail =
    contact?.email ?? user?.email.toLowerCase() ?? (kind === "email" ? value : null) ?? null;
  const oldPhone =
    contact?.phone || phoneKey(String(data.currentPhone ?? "")) || (kind === "phone" ? value : null) || null;
  const email = newEmail ?? oldEmail;
  if (!email && !newPhone) return NextResponse.json({ error: "Keep an email or a phone number" }, { status: 400 });

  if (email && email !== oldEmail) {
    const taken = await prisma.contact.findFirst({ where: { email, NOT: contact ? { id: contact.id } : undefined } });
    const takenUser = await prisma.user.findUnique({ where: { email } });
    if (taken || (takenUser && takenUser.id !== user?.id)) {
      return NextResponse.json({ error: "Another customer already uses that email" }, { status: 400 });
    }
  }

  const fields = {
    name,
    email,
    phone: newPhone,
    otherEmails: uniq([...(contact?.otherEmails ?? []), oldEmail], [email]),
    otherPhones: uniq([...(contact?.otherPhones ?? []), oldPhone || null], [newPhone]),
  };
  contact = contact
    ? await prisma.contact.update({ where: { id: contact.id }, data: fields })
    : await prisma.contact.create({ data: fields });

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { name, phone: newPhone, ...(email && email !== user.email.toLowerCase() ? { email } : {}) },
    });
  }
  return NextResponse.json({ ok: true, contactId: contact.id });
}

/**
 * Delete a customer: removes their account (if any), the owner-entered record,
 * and their name, email and phone from past orders (including orders made with
 * old emails/numbers on their profile). The orders themselves stay, so sales
 * totals and stock history are unchanged. ?key= and ?contactId= come from GET.
 */
export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const key = params.get("key") ?? "";
  const [kind, ...rest] = key.split(":");
  const value = rest.join(":");
  if (!value) return NextResponse.json({ error: "Missing customer" }, { status: 400 });

  const contactId = params.get("contactId");
  const contact = contactId ? await prisma.contact.findUnique({ where: { id: contactId } }) : null;
  const emails = new Set<string>([contact?.email, ...(contact?.otherEmails ?? [])].filter(Boolean) as string[]);
  const phones = new Set<string>([contact?.phone, ...(contact?.otherPhones ?? [])].filter(Boolean) as string[]);

  let userId: string | null = null;
  if (kind === "user") {
    const user = await prisma.user.findUnique({ where: { id: value } });
    if (!user) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    if (user.role === "ADMIN") return NextResponse.json({ error: "Admins can't be deleted here" }, { status: 400 });
    userId = user.id;
    emails.add(user.email.toLowerCase());
  } else if (kind === "email") {
    emails.add(value);
  } else if (kind === "phone") {
    phones.add(value);
  } else if (kind !== "contact") {
    return NextResponse.json({ error: "Invalid customer" }, { status: 400 });
  }

  // Guest orders made with any of their emails, or (with no email) any of their numbers
  const phoneOrders = phones.size
    ? (
        await prisma.order.findMany({
          where: { userId: null, guestPhone: { not: null } },
          select: { id: true, guestPhone: true },
        })
      )
        .filter((o) => phones.has(phoneKey(o.guestPhone)))
        .map((o) => o.id)
    : [];
  const anonymize = { guestName: null, guestEmail: null, guestPhone: null, notes: null };

  await prisma.$transaction([
    prisma.order.updateMany({
      where: {
        OR: [
          ...(userId ? [{ userId }] : []),
          ...[...emails].map((e) => ({ guestEmail: { equals: e, mode: "insensitive" as const } })),
          { id: { in: phoneOrders } },
        ],
      },
      data: { ...anonymize, userId: null },
    }),
    ...(userId ? [prisma.user.delete({ where: { id: userId } })] : []), // sessions/accounts cascade
    prisma.contact.deleteMany({
      where: { OR: [...(contact ? [{ id: contact.id }] : []), { email: { in: [...emails] } }] },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
