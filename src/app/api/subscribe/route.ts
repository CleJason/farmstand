import { NextResponse } from "next/server";
import { cleanEmail, cleanPhone } from "@/lib/drop-alerts";
import { addSubscriber, viaFor } from "@/lib/subscribers";

/**
 * Sign-ups: the home page "get drop alerts" form (email required), and the
 * Porch Pickup "tell me when it's open" form (`list: "stand"`; text, email or
 * both, via `via`). The reply is the same whether or not they were already on
 * the list, so it can't be used to check who signed up.
 */
export async function POST(req: Request) {
  const data = await req.json().catch(() => ({}));
  const list = data.list === "stand" ? "stand" : "drop";
  const email = data.email ? cleanEmail(data.email) : null;
  const phone = data.phone ? cleanPhone(data.phone) : null;
  if (data.email && !email) return NextResponse.json({ error: "Please enter a valid email" }, { status: 400 });
  if (data.phone && !phone) {
    return NextResponse.json({ error: "Please enter a valid phone number, or leave it blank" }, { status: 400 });
  }
  if (list === "drop" && !email) return NextResponse.json({ error: "Please enter a valid email" }, { status: 400 });
  if (!email && !phone) return NextResponse.json({ error: "Please enter a phone number or email" }, { status: 400 });

  const via = list === "stand" ? viaFor(phone, email, data.via) : undefined;
  if (via === "text" && !phone) return NextResponse.json({ error: "Please enter a phone number for texts" }, { status: 400 });
  if (via === "email" && !email) return NextResponse.json({ error: "Please enter an email" }, { status: 400 });
  if (via === "both" && (!phone || !email)) {
    return NextResponse.json({ error: "Please enter both a phone number and an email" }, { status: 400 });
  }

  await addSubscriber({ email, phone, list, via });
  return NextResponse.json({ ok: true });
}
