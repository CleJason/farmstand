import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { phoneKey } from "@/lib/phone";
import { mergeSubscribersFor } from "@/lib/subscribers";

type Side = {
  contactId?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  previousEmails?: string[];
  previousPhones?: string[];
};

const earlier = (a: Date | null | undefined, b: Date | null | undefined) => (a && b ? (a < b ? a : b) : a ?? b ?? null);
const later = (a: Date | null | undefined, b: Date | null | undefined) => (a && b ? (a > b ? a : b) : a ?? b ?? null);

/**
 * Make two customers one: a single owner-entered record holding both people's
 * emails and numbers, so Admin → Customers joins their orders (nothing on the
 * orders changes). `keep`'s details win; `other`'s go on the profile as earlier
 * ones. Imported history adds up, and their Drop Alerts entries become one.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const keep: Side = data.keep ?? {};
  const other: Side = data.other ?? {};

  const lower = (e: string | null | undefined) => e?.trim().toLowerCase() || null;
  const email = lower(keep.email) ?? lower(other.email);
  const phone = phoneKey(keep.phone) || phoneKey(other.phone) || null;
  const emails = [keep.email, ...(keep.previousEmails ?? []), other.email, ...(other.previousEmails ?? [])].map(lower).filter(Boolean) as string[];
  const phones = [keep.phone, ...(keep.previousPhones ?? []), other.phone, ...(other.previousPhones ?? [])].map((p) => phoneKey(p)).filter(Boolean);
  if (!email && !phone) return NextResponse.json({ error: "These customers have no email or phone to match on" }, { status: 400 });

  const [a, b] = await Promise.all([
    keep.contactId ? prisma.contact.findUnique({ where: { id: keep.contactId } }) : null,
    other.contactId ? prisma.contact.findUnique({ where: { id: other.contactId } }) : null,
  ]);
  const fields = {
    name: keep.name?.trim() || other.name?.trim() || null,
    email,
    phone,
    otherEmails: [...new Set([...emails, ...(a?.otherEmails ?? []), ...(b?.otherEmails ?? [])])].filter((e) => e !== email),
    otherPhones: [...new Set([...phones, ...(a?.otherPhones ?? []), ...(b?.otherPhones ?? [])])].filter((p) => p !== phone),
    importedOrders: (a?.importedOrders ?? 0) + (b?.importedOrders ?? 0),
    importedSpent: (a?.importedSpent ?? 0) + (b?.importedSpent ?? 0),
    firstOrderAt: earlier(a?.firstOrderAt, b?.firstOrderAt),
    lastOrderAt: later(a?.lastOrderAt, b?.lastOrderAt),
    customerSince: earlier(a?.customerSince, b?.customerSince),
    note: [a?.note, b?.note].filter(Boolean).join("\n") || null,
  };

  // Someone else entirely already has that email
  if (email) {
    const taken = await prisma.contact.findUnique({ where: { email } });
    if (taken && taken.id !== a?.id && taken.id !== b?.id) {
      return NextResponse.json({ error: "A third customer already uses that email. Merge that one first." }, { status: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    if (b && b.id !== a?.id) await tx.contact.delete({ where: { id: b.id } });
    if (a) await tx.contact.update({ where: { id: a.id }, data: fields });
    else await tx.contact.create({ data: fields });
  });
  await mergeSubscribersFor(emails, phones);
  return NextResponse.json({ ok: true });
}
