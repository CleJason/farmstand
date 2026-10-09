import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanEmail, cleanPhone } from "@/lib/drop-alerts";

/**
 * Home page "get drop alerts" sign-up. The reply is the same whether or not
 * the email was already on the list, so it can't be used to check who signed up.
 */
export async function POST(req: Request) {
  const data = await req.json().catch(() => ({}));
  const email = cleanEmail(data.email);
  if (!email) return NextResponse.json({ error: "Please enter a valid email" }, { status: 400 });
  const phone = data.phone ? cleanPhone(data.phone) : null;
  if (data.phone && !phone) {
    return NextResponse.json({ error: "Please enter a valid phone number, or leave it blank" }, { status: 400 });
  }

  await prisma.subscriber.upsert({
    where: { email },
    create: { email, phone },
    update: phone ? { phone } : {},
  });
  return NextResponse.json({ ok: true });
}
