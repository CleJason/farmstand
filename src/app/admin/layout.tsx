import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { redirectToSetupIfNeeded } from "@/lib/first-run";
import type { Metadata } from "next";
import { getSiteSettings, standHref } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import InstallPrompt from "@/components/InstallPrompt";

export const runtime = "nodejs";

// The installable app is the admin panel; only admin pages advertise it
export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteSettings();
  const v = encodeURIComponent(site.SITE_LOGO_URL || "default");
  return {
    manifest: "/manifest.webmanifest",
    icons: { apple: `/pwa-icon/180?v=${v}` },
    appleWebApp: { capable: true, title: `${site.SITE_NAME} Admin`, statusBarStyle: "default" },
  };
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Nothing of the admin panel renders unless the viewer is an admin
  await redirectToSetupIfNeeded();
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/");
  const [site, unreadTexts] = await Promise.all([
    getSiteSettings(),
    prisma.smsMessage.count({ where: { direction: "IN", read: false } }).catch(() => 0),
  ]);

  const navItems = [
    { href: "/admin", label: "Orders", icon: "📋" },
    { href: "/admin/messages", label: unreadTexts ? `Messages (${unreadTexts})` : "Messages", icon: "💬" },
    { href: "/admin/drops", label: "Drops", icon: "📅" },
    { href: "/admin/farmstand", label: site.SITE_FARMSTAND_HEADING, icon: "🏪" },
    { href: "/admin/products", label: "Products", icon: "📦" },
    { href: "/admin/customers", label: "Customers", icon: "👥" },
    { href: "/admin/alerts", label: "Drop Alerts", icon: "📣" },
    { href: "/admin/bulk-message", label: "Bulk Message", icon: "✉️" },
    { href: "/admin/discounts", label: "Discounts", icon: "🏷️" },
    { href: "/admin/gift-cards", label: "Gift Cards", icon: "🎁" },
    { href: "/admin/reviews", label: "Reviews", icon: "⭐" },
    { href: "/admin/site", label: "Site", icon: "🎨" },
    { href: "/admin/settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-60 bg-white border-b md:border-b-0 md:border-r border-stone-200 flex flex-col shrink-0">
        <div className="p-5 border-b border-stone-100">
          <Link href="/admin" className="block">
            <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">
              Admin
            </span>
            <h1 className="text-base font-bold text-stone-900 tracking-tight mt-0.5">
              {site.SITE_NAME}
            </h1>
          </Link>
          <Link
            href="/"
            className="mt-3 flex items-center justify-center gap-1.5 w-full text-sm font-semibold px-3 py-2 rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 transition-colors"
          >
            ← View storefront
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-50 transition-colors"
            >
              <span className="text-sm">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-stone-100 space-y-3">
          <div className="text-xs text-stone-400">
            {session?.user?.email || "Not signed in"}
          </div>
          <div className="flex gap-2">
            <Link
              href="/"
              className="flex-1 text-center text-xs font-medium px-3 py-1.5 bg-stone-50 hover:bg-stone-100 rounded-lg text-stone-600 transition-colors"
            >
              ← Storefront
            </Link>
            <Link
              href={standHref(site)}
              className="flex-1 text-center text-xs font-medium px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors"
            >
              Kiosk
            </Link>
          </div>
          <div className="text-[10px] text-stone-300 font-mono" title="Running app version">
            v {(process.env.APP_VERSION || "dev").slice(0, 7)}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-5 md:p-8 overflow-y-auto">
        <div className="max-w-6xl">{children}</div>
        <InstallPrompt />
      </main>
    </div>
  );
}
