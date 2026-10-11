import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { cleanEmail } from "@/lib/drop-alerts";
import { phoneKey } from "@/lib/phone";

const MAX_ROWS = 5000;

const intOr0 = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0);
const dateOrNull = (v: unknown) => {
  const d = v ? new Date(String(v)) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/**
 * Add customers by hand or from a CSV export (e.g. Hotplate). Each person
 * needs an email or a phone number. Someone already on the list (same email,
 * or same phone when there's no email; old ones count too) is updated rather
 * than duplicated; re-importing the same file just refreshes their history.
 * With `subscribe`, people with an email join Drop Alerts, except anyone the
 * file marks as not subscribed.
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

    // History from the file (only set when the file has it)
    const history = {
      ...(r.orders !== undefined ? { importedOrders: intOr0(r.orders) } : {}),
      ...(r.spent !== undefined ? { importedSpent: intOr0(r.spent) } : {}),
      ...(dateOrNull(r.firstOrderAt) ? { firstOrderAt: dateOrNull(r.firstOrderAt) } : {}),
      ...(dateOrNull(r.lastOrderAt) ? { lastOrderAt: dateOrNull(r.lastOrderAt) } : {}),
      ...(dateOrNull(r.since) ? { customerSince: dateOrNull(r.since) } : {}),
      ...(r.note ? { note: String(r.note).slice(0, 1000) } : {}),
    };

    // Match on current or earlier emails/numbers kept on their profile
    const existing = email
      ? await prisma.contact.findFirst({ where: { OR: [{ email }, { otherEmails: { has: email } }] } })
      : await prisma.contact.findFirst({ where: { OR: [{ phone: phone! }, { otherPhones: { has: phone! } }] } });
    if (existing) {
      await prisma.contact.update({
        where: { id: existing.id },
        data: {
          ...history,
          ...(!existing.name && name ? { name } : {}),
          ...(!existing.phone && phone ? { phone } : {}),
        },
      });
      updated++;
    } else {
      await prisma.contact.create({ data: { email, phone, name, ...history } });
      added++;
    }

    // Email people get email alerts; phone-only people get text alerts once texting is set up
    if (subscribe && r.subscribed !== false) {
      const already = email
        ? await prisma.subscriber.findUnique({ where: { email } })
        : await prisma.subscriber.findFirst({ where: { phone: phone! } });
      if (!already) {
        await prisma.subscriber.create({ data: { email, phone } });
        subscribed++;
      }
    }
  }

  return NextResponse.json({ added, updated, subscribed, skipped });
}
