import { NextResponse } from "next/server";
import { getAdminEmails, isAdminEmail } from "@/lib/admin-emails";

/**
 * Used by the login form when someone signs in to reach /admin, so a
 * non-admin email gets a clear message instead of a customer sign-in link.
 */
export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({ email: "" }));
  // With no admin list configured (older installs), don't block anyone here
  const admin = getAdminEmails().length === 0 || isAdminEmail(String(email || ""));
  return NextResponse.json({ admin });
}
