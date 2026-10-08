import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Geist } from "next/font/google";
import { getSetting } from "@/lib/settings";
import { getSiteSettings, isHexColor, isOn, publicSite } from "@/lib/site";
import { SiteProvider } from "@/components/SiteProvider";
import { auth } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

function brandColor(value: string) {
  return isHexColor(value) ? value : "#D97706";
}

export async function generateMetadata(): Promise<Metadata> {
  // Read at request time so changes in admin show without a rebuild
  await connection();
  const [site, faviconSetting, appUrl] = await Promise.all([
    getSiteSettings(),
    getSetting("FAVICON_URL"),
    getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || ""),
  ]);
  const favicon = faviconSetting || "/icon.png";
  let metadataBase: URL | undefined;
  try {
    metadataBase = appUrl ? new URL(appUrl) : undefined;
  } catch {}

  const tabName = isOn(site.SITE_NAME_IN_TAB) ? site.SITE_NAME : site.SITE_TAGLINE;
  // Link previews when the site is shared (Facebook, Messages…): cover photo, else logo
  const previewImage = site.SITE_COVER_URL || site.SITE_LOGO_URL;
  return {
    metadataBase,
    title: { default: tabName, template: isOn(site.SITE_NAME_IN_TAB) ? `%s · ${site.SITE_NAME}` : "%s" },
    description: site.SITE_TAGLINE,
    icons: { icon: favicon },
    openGraph: {
      title: site.SITE_NAME,
      description: site.SITE_TAGLINE,
      siteName: site.SITE_NAME,
      type: "website",
      ...(previewImage && metadataBase ? { images: [previewImage] } : {}),
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  await connection();
  const site = await getSiteSettings();
  return { themeColor: brandColor(site.SITE_BRAND_COLOR) };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const [site, session] = await Promise.all([getSiteSettings(), auth()]);
  const viewer = session?.user
    ? { email: session.user.email ?? null, isAdmin: session.user.role === "ADMIN" }
    : null;

  return (
    <html lang="en" style={{ "--brand": brandColor(site.SITE_BRAND_COLOR) } as React.CSSProperties}>
      <body className={`${geistSans.variable} font-sans antialiased`}>
        <SiteProvider site={publicSite(site)} viewer={viewer}>
          {children}
        </SiteProvider>
      </body>
    </html>
  );
}
