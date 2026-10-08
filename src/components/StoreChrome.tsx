"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useSite, useViewer } from "@/components/SiteProvider";
import { isOn } from "@/lib/site-defaults";

/** Top-left brand: logo and/or name, per the owner's header checkboxes. */
export function ShopBrand({ className = "" }: { className?: string }) {
  const site = useSite();
  const showLogo = isOn(site.SITE_LOGO_IN_HEADER) && !!site.SITE_LOGO_URL;
  const showName = isOn(site.SITE_NAME_IN_HEADER);
  if (!showLogo && !showName) return <span />; // keeps the nav links right-aligned

  return (
    <Link
      href="/"
      aria-label={site.SITE_NAME}
      className={`flex items-center gap-2 font-bold text-stone-900 tracking-tight ${className}`}
    >
      {showLogo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={site.SITE_LOGO_URL}
          alt=""
          className={showName ? "h-8 w-8 rounded-lg object-contain" : "h-9 max-w-[160px] object-contain"}
        />
      )}
      {showName && <span>{site.SITE_NAME}</span>}
    </Link>
  );
}

/** Sign In when signed out; Admin (for admins) and Sign out when signed in. */
function AccountLinks() {
  const viewer = useViewer();
  const quiet = "text-sm text-stone-500 hover:text-stone-900 font-medium transition-colors";
  const primary =
    "text-sm bg-stone-900 text-white px-4 py-1.5 rounded-full font-medium hover:bg-stone-800 transition-colors";

  if (!viewer) {
    return (
      <Link href="/login" className={primary}>
        Sign In
      </Link>
    );
  }

  return (
    <>
      {viewer.isAdmin && (
        <Link href="/admin" className={primary}>
          Admin
        </Link>
      )}
      <button type="button" onClick={() => signOut({ callbackUrl: "/" })} className={quiet}>
        Sign out
      </button>
    </>
  );
}

export function StoreHeader() {
  return (
    <nav className="border-b border-stone-100 bg-white/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <ShopBrand className="text-lg" />
        <div className="flex items-center gap-4">
          <Link
            href="/gift"
            className="hidden sm:inline text-sm text-stone-500 hover:text-stone-900 font-medium transition-colors"
          >
            Gift Cards
          </Link>
          <Link
            href="/farmstand"
            className="text-sm text-stone-500 hover:text-stone-900 font-medium transition-colors"
          >
            Farmstand
          </Link>
          <AccountLinks />
        </div>
      </div>
    </nav>
  );
}

