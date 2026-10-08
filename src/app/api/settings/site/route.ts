import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getSiteSettings, isHexColor, publicSite, SITE_KEYS, TOGGLE_KEYS, type SiteKey } from "@/lib/site";

const MAX_LENGTH = 2000;

export async function GET() {
  // Private fields (exact pickup address) only go to admins
  const session = await auth();
  const site = await getSiteSettings();
  return NextResponse.json(session?.user?.role === "ADMIN" ? site : publicSite(site));
}

/** Save any of the site fields. Empty values fall back to the defaults. Admin only. */
export async function PUT(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const current = await getSiteSettings();
  const updates: { key: string; value: string }[] = [];
  for (const key of SITE_KEYS) {
    if (typeof body[key] !== "string") continue;
    if (key === "SITE_PRIVACY_UPDATED" || key === "SITE_TERMS_UPDATED") continue; // set below
    const max = key === "SITE_PRIVACY" || key === "SITE_TERMS" ? 20000 : MAX_LENGTH;
    const value = body[key].trim().slice(0, max);
    updates.push({ key, value });
  }

  // "Last updated" on the legal pages follows actual edits to their text
  const today = new Date().toISOString().slice(0, 10);
  for (const key of ["SITE_PRIVACY", "SITE_TERMS"] as const) {
    const next = updates.find((u) => u.key === key)?.value;
    if (next !== undefined && next !== current[key]) {
      updates.push({ key: `${key}_UPDATED`, value: next ? today : "" });
    }
  }

  const color = updates.find((u) => u.key === "SITE_BRAND_COLOR")?.value;
  if (color && !isHexColor(color)) {
    return NextResponse.json({ error: "Brand color must look like #D97706" }, { status: 400 });
  }
  for (const u of updates) {
    if (TOGGLE_KEYS.includes(u.key as SiteKey)) u.value = u.value === "true" ? "true" : "false";
  }
  const logo = updates.find((u) => u.key === "SITE_LOGO_URL")?.value;
  if (logo && !/^\/uploads\/[\w.-]+$/.test(logo)) {
    return NextResponse.json({ error: "Invalid logo" }, { status: 400 });
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.setting.upsert({ where: { key: u.key }, update: { value: u.value }, create: u })
    )
  );

  return NextResponse.json(await getSiteSettings());
}
