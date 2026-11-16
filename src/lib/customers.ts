import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/phone";
import { rewardSettings } from "@/lib/rewards";

// Orders that represent a real purchase (not abandoned card checkouts or cancellations)
const COUNTED = ["AWAITING_CONFIRM", "PAID", "READY", "PICKED_UP"];
// Loyalty points: earned per $1 actually paid (Admin → Rewards), so unpaid
// Venmo/PayPal orders wait, refunds drop off, and buying a gift card doesn't earn.
const EARNS_POINTS = ["PAID", "READY", "PICKED_UP"];

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
  imported: { orders: number; spent: number; firstOrderAt: string | null; lastOrderAt: string | null } | null;
  note: string | null;
  signedUpAt: string | null;
  orderCount: number;
  totalSpent: number; // cents, counted orders only
  pointsSpent: number; // cents that earn points: paid orders here plus imported history
  points: number; // earned from what they've paid, plus adjustments
  pointAdjustments: { id: string; points: number; reason: string; createdAt: string }[];
  lastOrderAt: string | null;
  orders: CustomerOrder[];
};

const blank = (key: string, kind: Customer["kind"]): Customer => ({
  key,
  kind,
  name: null,
  email: null,
  phone: null,
  previousEmails: [],
  previousPhones: [],
  contactId: null,
  imported: null,
  note: null,
  signedUpAt: null,
  orderCount: 0,
  totalSpent: 0,
  pointsSpent: 0,
  points: 0,
  pointAdjustments: [],
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
export async function loadCustomers(): Promise<Customer[]> {
  const { pointsPerDollar } = await rewardSettings();
  const [users, orders, contacts, adjustments] = await Promise.all([
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
    prisma.pointsAdjustment.findMany({ orderBy: { createdAt: "desc" } }),
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
    if (EARNS_POINTS.includes(o.status) && o.type !== "GIFT") c.pointsSpent += o.total;
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
        target.pointsSpent += other.pointsSpent;
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
    target.note = ct.note;
    // History brought over from Hotplate etc. counts in their totals
    if (ct.importedOrders || ct.importedSpent || ct.lastOrderAt) {
      target.imported = {
        orders: ct.importedOrders,
        spent: ct.importedSpent,
        firstOrderAt: ct.firstOrderAt?.toISOString() ?? null,
        lastOrderAt: ct.lastOrderAt?.toISOString() ?? null,
      };
      target.orderCount += ct.importedOrders;
      target.totalSpent += ct.importedSpent;
      target.pointsSpent += ct.importedSpent;
      const last = ct.lastOrderAt?.toISOString();
      if (last && last > (target.lastOrderAt ?? "")) target.lastOrderAt = last;
    }
    const since = ct.customerSince?.toISOString();
    if (since && since < (target.signedUpAt ?? "9999")) target.signedUpAt = since;
    for (const e of emails) byEmail.set(e, target.key);
    for (const p of phones) byPhone.set(p, target.key);
  }

  for (const a of adjustments) {
    const key = (a.email && byEmail.get(a.email)) || (a.phone && byPhone.get(a.phone));
    const c = key ? customers.get(key) : undefined;
    c?.pointAdjustments.push({ id: a.id, points: a.points, reason: a.reason, createdAt: a.createdAt.toISOString() });
  }

  const list = [...customers.values()]
    .map((c) => ({
      ...c,
      points: Math.floor((c.pointsSpent / 100) * pointsPerDollar) + c.pointAdjustments.reduce((sum, a) => sum + a.points, 0),
    }))
    .sort((a, b) => (b.lastOrderAt ?? b.signedUpAt ?? "").localeCompare(a.lastOrderAt ?? a.signedUpAt ?? ""));
  return list;
}
