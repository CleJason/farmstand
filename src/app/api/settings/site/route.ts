import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { cleanPosition } from "@/lib/image-position";
import { parseCopy } from "@/lib/copy";
import {
  cleanPath,
  getSiteSettings,
  isHexColor,
  publicSite,
  SITE_KEYS,
  TOGGLE_KEYS,
  type SiteKey,
} from "@/lib/site";

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
    const max =
      key === "SITE_PRIVACY" || key === "SITE_TERMS" ? 20000 : key === "SITE_COPY" ? 100000 : MAX_LENGTH;
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

  for (const key of ["SITE_BRAND_COLOR", "SITE_BUTTON_TEXT_COLOR"]) {
    const color = updates.find((u) => u.key === key)?.value;
    if (color && !isHexColor(color)) {
      return NextResponse.json({ error: "Colors must look like #D97706" }, { status: 400 });
    }
  }
  const path = updates.find((u) => u.key === "SITE_FARMSTAND_PATH");
  if (path && path.value) {
    const clean = cleanPath(path.value);
    if (!clean) {
      return NextResponse.json(
        { error: "That page address is taken by a built-in page. Try another, e.g. porch-pickup" },
        { status: 400 }
      );
    }
    path.value = clean;
  }
  const copy = updates.find((u) => u.key === "SITE_COPY");
  if (copy) {
    // Keep only known keys with text; drop anything else
    const parsed = parseCopy(copy.value);
    copy.value = Object.keys(parsed).length ? JSON.stringify(parsed) : "";
  }
  for (const u of updates) {
    if (TOGGLE_KEYS.includes(u.key as SiteKey)) u.value = u.value === "true" ? "true" : "false";
  }
  for (const key of ["SITE_LOGO_URL", "SITE_COVER_URL"]) {
    const url = updates.find((u) => u.key === key)?.value;
    if (url && !/^\/uploads\/[\w.-]+$/.test(url)) {
      return NextResponse.json({ error: "Invalid image" }, { status: 400 });
    }
  }
  const coverPos = updates.find((u) => u.key === "SITE_COVER_POSITION");
  if (coverPos) coverPos.value = cleanPosition(coverPos.value) ?? "";

  await prisma.$transaction(
    updates.map((u) =>
      prisma.setting.upsert({ where: { key: u.key }, update: { value: u.value }, create: u })
    )
  );

  return NextResponse.json(await getSiteSettings());
}
