import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { cleanEmail } from "@/lib/drop-alerts";
import { phoneKey } from "@/lib/phone";

const MAX_ROWS = 5000;

/**
 * Add customers by hand or from a CSV export (e.g. Hotplate). Each person
 * needs an email or a phone number. Someone already on the list (same email,
 * or same phone when there's no email) only gets missing details filled in.
 * Optionally adds people with an email to the Drop Alerts list too.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const rows: unknown[] = Array.isArray(data.rows) ? data.rows.slice(0, MAX_ROWS) : [];
  const subscribe = data.subscribe === true;

  let added = 0;
  let updated = 0;
  let subscribed = 0;
  let skipped = 0;
  const seen = new Set<string>();

  for (const raw of rows) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const email = cleanEmail(r.email);
    const phone = phoneKey(String(r.phone ?? "")) || null;
    const name = String(r.name ?? "").trim().slice(0, 100) || null;
    if (!email && !phone) {
      skipped++;
      continue;
    }
    const dedupe = email ?? `phone:${phone}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const existing = email
      ? await prisma.contact.findUnique({ where: { email } })
      : await prisma.contact.findFirst({ where: { phone: phone!, email: null } });
    if (existing) {
      const patch: { name?: string; phone?: string } = {};
      if (!existing.name && name) patch.name = name;
      if (!existing.phone && phone) patch.phone = phone;
      if (Object.keys(patch).length) {
        await prisma.contact.update({ where: { id: existing.id }, data: patch });
        updated++;
      }
    } else {
      await prisma.contact.create({ data: { email, phone, name } });
      added++;
    }

    if (subscribe && email && !(await prisma.subscriber.findUnique({ where: { email } }))) {
      await prisma.subscriber.create({ data: { email, phone } });
      subscribed++;
    }
  }

  return NextResponse.json({ added, updated, subscribed, skipped });
}
