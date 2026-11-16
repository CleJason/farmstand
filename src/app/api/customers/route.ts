import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { phoneKey } from "@/lib/phone";
import { cleanEmail } from "@/lib/drop-alerts";
import { loadCustomers, type Customer } from "@/lib/customers";

export type { Customer, CustomerOrder } from "@/lib/customers";

async function requireAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

/** Everyone who has signed up, ordered, or been added by the owner (see lib/customers). */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await loadCustomers());
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
    prisma.pointsAdjustment.deleteMany({ where: { OR: [{ email: { in: [...emails] } }, { phone: { in: [...phones] } }] } }),
  ]);

  return NextResponse.json({ ok: true });
}
