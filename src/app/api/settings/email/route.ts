import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth, getSmtpSettings } from "@/lib/auth";

async function isAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

/** Sign-in email (SMTP) settings. The password is never sent back to the browser. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const s = await getSmtpSettings();
  return NextResponse.json({
    EMAIL_SERVER_HOST: s.EMAIL_SERVER_HOST,
    EMAIL_SERVER_PORT: s.EMAIL_SERVER_PORT,
    EMAIL_SERVER_USER: s.EMAIL_SERVER_USER,
    EMAIL_FROM: s.EMAIL_FROM,
    hasPassword: !!s.EMAIL_SERVER_PASS,
  });
}

/** Plain fields save as sent; the password only changes when a new one is typed. */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  const updates: { key: string; value: string }[] = [];
  for (const key of ["EMAIL_SERVER_HOST", "EMAIL_SERVER_PORT", "EMAIL_SERVER_USER", "EMAIL_FROM"]) {
    if (typeof body[key] === "string") updates.push({ key, value: body[key].trim() });
  }
  if (typeof body.EMAIL_SERVER_PASS === "string" && body.EMAIL_SERVER_PASS) {
    updates.push({ key: "EMAIL_SERVER_PASS", value: body.EMAIL_SERVER_PASS });
  }

  const port = updates.find((u) => u.key === "EMAIL_SERVER_PORT")?.value;
  if (port && !/^\d{2,5}$/.test(port)) {
    return NextResponse.json({ error: "Port should be a number like 465 or 587" }, { status: 400 });
  }

  await prisma.$transaction(
    updates.map((u) => prisma.setting.upsert({ where: { key: u.key }, update: { value: u.value }, create: u }))
  );
  return NextResponse.json({ ok: true });
}
