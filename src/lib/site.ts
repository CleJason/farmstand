import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { SITE_DEFAULTS, SITE_KEYS, type SiteKey, type SiteSettings } from "@/lib/site-defaults";

export * from "@/lib/site-defaults";

export async function getSiteSettings(): Promise<SiteSettings> {
  // Request-time only; never query the database while building pages
  await connection();
  const site: SiteSettings = { ...SITE_DEFAULTS };
  try {
    const rows = await prisma.setting.findMany({ where: { key: { in: SITE_KEYS } } });
    for (const r of rows) {
      if (r.value) site[r.key as SiteKey] = r.value;
    }
  } catch {
    // DB not ready (first boot / build) — defaults are fine
  }
  return site;
}
