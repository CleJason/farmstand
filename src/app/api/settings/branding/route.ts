import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getSetting } from "@/lib/settings";

export async function GET() {
  return NextResponse.json({ faviconUrl: await getSetting("FAVICON_URL") });
}

/** Set (or clear, with an empty value) the site favicon. Admin only. */
export async function PUT(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { faviconUrl } = await req.json();
  const value = typeof faviconUrl === "string" ? faviconUrl : "";
  // Only accept files uploaded through /api/upload
  if (value && !/^\/uploads\/[\w.-]+$/.test(value)) {
    return NextResponse.json({ error: "Invalid favicon URL" }, { status: 400 });
  }

  await prisma.setting.upsert({
    where: { key: "FAVICON_URL" },
    update: { value },
    create: { key: "FAVICON_URL", value },
  });

  return NextResponse.json({ faviconUrl: value });
}
