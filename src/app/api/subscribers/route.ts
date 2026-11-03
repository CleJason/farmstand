import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { phoneKey } from "@/lib/phone";
import { cleanEmail, cleanPhone } from "@/lib/drop-alerts";
import { addSubscriber, knownNames, type AlertList } from "@/lib/subscribers";
import { optedOutSet } from "@/lib/sms-opt-out";

/** Where someone was added from (?list=stand = Porch Pickup); it's all one list. */
const listOf = (v: unknown): AlertList => (v === "stand" ? "stand" : "drop");

async function isAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

/** Everyone subscribed (drop alerts and Porch Pickup notices), for the admin only. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [subscribers, { byEmail, byPhone }, optedOut] = await Promise.all([
    prisma.subscriber.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, phone: true, createdAt: true, dropVia: true, standVia: true },
    }),
    knownNames(),
    optedOutSet(),
  ]);

  return NextResponse.json(
    subscribers.map((s) => ({
      ...s,
      name: (s.email && byEmail.get(s.email)) || (s.phone && byPhone.get(phoneKey(s.phone))) || null,
      // Replied STOP: no texts until they reply START
      stopped: !!s.phone && optedOut.has(phoneKey(s.phone)),
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

/**
 * Fix someone's details (`id`, `email`, `phone`; empty = remove it), e.g. a
 * misspelled email that bounces every week. They keep at least one of the two,
 * and their choice follows what's left: no email means texts, no phone emails.
 */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const id = String(data.id ?? "");
  const email = data.email ? cleanEmail(data.email) : null;
  const phone = data.phone ? cleanPhone(data.phone) : null;
  if (data.email && !email) return NextResponse.json({ error: "That email doesn't look right" }, { status: 400 });
  if (data.phone && !phone) return NextResponse.json({ error: "That phone number doesn't look right" }, { status: 400 });
  if (!email && !phone) {
    return NextResponse.json({ error: "Keep an email or a phone number (or use Remove)" }, { status: 400 });
  }
  const current = await prisma.subscriber.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (email && email !== current.email && (await prisma.subscriber.findUnique({ where: { email } }))) {
    return NextResponse.json({ error: "Someone else on the list already has that email" }, { status: 400 });
  }
  // `via` (text | email | both) is how they get alerts; it has to fit what they gave
  const asked = ["text", "email", "both"].includes(data.via) ? (data.via as string) : null;
  if (asked === "text" && !phone) return NextResponse.json({ error: "Texts need a phone number" }, { status: 400 });
  if (asked === "email" && !email) return NextResponse.json({ error: "Emails need an email address" }, { status: 400 });
  if (asked === "both" && (!phone || !email)) {
    return NextResponse.json({ error: "Both needs a phone number and an email" }, { status: 400 });
  }
  const fit = (via: string | null) => asked ?? (!email ? "text" : !phone ? "email" : via);
  await prisma.subscriber.update({
    where: { id },
    data: { email, phone, dropVia: fit(current.dropVia), standVia: fit(current.standVia) ?? "text" },
  });
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
