import { NextResponse } from "next/server";
import { checkLoginCode, normalizeEmail } from "@/lib/login-code";

/** Login page: checks a typed sign-in code before going to the sign-in callback. */
export async function POST(req: Request) {
  const { email, code } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || typeof code !== "string" || !/^\d{6}$/.test(code.replace(/\s/g, ""))) {
    return NextResponse.json({ result: "wrong" });
  }
  return NextResponse.json({ result: await checkLoginCode(email, code), email: normalizeEmail(email) });
}
