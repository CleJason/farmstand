import { getSiteSettings, isHexColor } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Manifest for the installable admin app, built from Admin → Site. All URLs are
 * relative, so it works on whatever domain the owner hosts it.
 * Scope stays "/" so sign-in (/login, /api/auth) happens inside the app window.
 */
export async function GET() {
  const site = await getSiteSettings();
  const theme = isHexColor(site.SITE_BRAND_COLOR) ? site.SITE_BRAND_COLOR : "#D97706";
  const v = encodeURIComponent(site.SITE_LOGO_URL || "default"); // bust icon caches when the logo changes

  const manifest = {
    id: "/admin",
    name: `${site.SITE_NAME} Admin`,
    short_name: site.SITE_NAME.length > 12 ? site.SITE_NAME.split(/\s+/)[0] : site.SITE_NAME,
    description: `Manage orders and products for ${site.SITE_NAME}`,
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: theme,
    icons: [
      { src: `/pwa-icon/192?v=${v}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/pwa-icon/512?v=${v}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/pwa-icon/512?maskable=1&v=${v}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Orders", url: "/admin" },
      { name: "Products", url: "/admin/products" },
      { name: site.SITE_FARMSTAND_HEADING, url: "/admin/farmstand" },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" },
  });
}
