import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-input";
import { requestReviewFromCustomer } from "@/lib/review-requests";

/** Admin → Customers → "Ask for a review": `{ name, email, phone }` of a customer (any, including Hotplate-only ones). */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const result = await requestReviewFromCustomer({
    name: data.name ? String(data.name) : null,
    email: data.email ? String(data.email) : null,
    phone: data.phone ? String(data.phone) : null,
  });
  if (!result.sent) return NextResponse.json({ error: result.reason ?? "Couldn't send it" }, { status: 400 });
  return NextResponse.json(result);
}
