import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { getSiteSettings } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIZES = new Set([180, 192, 512]);

/**
 * App icons for the installed app (manifest + iOS home screen), made from the
 * owner's logo when uploaded, otherwise the default icon.
 *   /pwa-icon/192            plain icon
 *   /pwa-icon/512?maskable=1 logo inset on a solid background, so Android's
 *                            circle/squircle masks don't crop it
 */
export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const maskable = new URL(req.url).searchParams.has("maskable");

  const site = await getSiteSettings();
  const publicDir = path.join(process.cwd(), "public");
  let source = path.join(publicDir, "icon.png");
  if (site.SITE_LOGO_URL.startsWith("/uploads/")) {
    source = path.join(publicDir, "uploads", path.basename(site.SITE_LOGO_URL));
  }

  let input: Buffer;
  try {
    input = await readFile(source);
  } catch {
    input = await readFile(path.join(publicDir, "icon.png"));
  }

  // iOS and maskable icons need an opaque square; inset the logo with padding
  const padded = maskable || size === 180;
  const inner = padded ? Math.round(size * (maskable ? 0.7 : 0.84)) : size;
  const logo = await sharp(input, { density: 300 })
    .resize(inner, inner, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: padded ? 1 : 0 } })
    .png()
    .toBuffer();

  const png = padded
    ? await sharp({ create: { width: size, height: size, channels: 4, background: "#FFFFFF" } })
        .composite([{ input: logo, gravity: "center" }])
        .png()
        .toBuffer()
    : logo;

  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
