import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendOrderConfirmation } from "@/lib/stripe-paid";

/** Admin → Orders → "Resend confirmation": the customer's paid-order email/text again. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const sent = await sendOrderConfirmation(id, { toOwner: false });
  if (!sent) {
    return NextResponse.json(
      { error: "Couldn't send it. Check that n8n is running and the workflow is published." },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
