import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { fireNotification } from "@/lib/notifications";
import { phoneKey } from "@/lib/phone";
import { isOptedOut } from "@/lib/sms-opt-out";
import { getSiteSettings } from "@/lib/site";
import { sendShopEmail } from "@/lib/send-email";

/**
 * Admin → Orders → "Message customer": a note about this order (e.g. "please
 * pick it up by Thursday"), by `via` email, text or both. It's about their
 * order, so it goes right away (no texting hours), but never texts after STOP.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const data = await req.json().catch(() => ({}));
  const message = String(data.message ?? "").trim().slice(0, 2000);
  if (!message) return NextResponse.json({ error: "Write the message first" }, { status: 400 });
  const via = data.via === "text" || data.via === "both" ? data.via : "email";

  const order = await prisma.order.findUnique({ where: { id }, include: { user: true } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const email = order.guestEmail || order.user?.email || "";
  const phone = phoneKey(order.guestPhone || order.user?.phone);

  const done: string[] = [];
  const problems: string[] = [];
  if (via !== "text") {
    if (!email) problems.push("no email on this order");
    else {
      const site = await getSiteSettings();
      const err = await sendShopEmail({ to: email, subject: `${site.SITE_NAME}: your order #${order.id.slice(-6).toUpperCase()}`, text: message });
      if (err) problems.push(err);
      else done.push("email");
    }
  }
  if (via !== "email") {
    if (!phone) problems.push("no phone on this order");
    else if (await isOptedOut(phone)) problems.push("they replied STOP, so no text");
    else {
      const e164 = phone.length === 10 ? `+1${phone}` : `+${phone}`;
      if (await fireNotification("sms.send", { phone: e164, message })) {
        await prisma.smsMessage.create({ data: { phone, direction: "OUT", body: message, read: true } });
        done.push("text");
      } else problems.push("couldn't reach the texting service");
    }
  }
  if (!done.length) return NextResponse.json({ error: `Not sent: ${problems.join("; ")}` }, { status: 400 });
  return NextResponse.json({ sent: done, problems });
}
