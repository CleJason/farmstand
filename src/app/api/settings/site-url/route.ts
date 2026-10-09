import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getSetting } from "@/lib/settings";

async function isAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

/** The public web address used in emails, share previews and links (set first in the setup wizard). */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ appUrl: await getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || "") });
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { appUrl } = await req.json().catch(() => ({}));
  let value: string;
  try {
    const url = new URL(String(appUrl ?? "").trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    value = url.origin; // just https://host, no path or trailing slash
  } catch {
    return NextResponse.json({ error: "Enter the full address, e.g. https://shop.yourdomain.com" }, { status: 400 });
  }
  await prisma.setting.upsert({
    where: { key: "APP_URL" },
    update: { value },
    create: { key: "APP_URL", value },
  });
  return NextResponse.json({ appUrl: value });
}
