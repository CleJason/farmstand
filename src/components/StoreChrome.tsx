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
function AccountLinks({ variant }: { variant: "header" | "footer" }) {
  const viewer = useViewer();
  const quiet =
    variant === "header"
      ? "text-sm text-stone-500 hover:text-stone-900 font-medium transition-colors"
      : "hover:text-stone-600 transition-colors";

  if (!viewer) {
    return (
      <Link
        href="/login"
        className={
          variant === "header"
            ? "text-sm bg-stone-900 text-white px-4 py-1.5 rounded-full font-medium hover:bg-stone-800 transition-colors"
            : quiet
        }
      >
        Sign In
      </Link>
    );
  }

  return (
    <>
      {viewer.isAdmin && (
        <Link
          href="/admin"
          className={
            variant === "header"
              ? "text-sm bg-stone-900 text-white px-4 py-1.5 rounded-full font-medium hover:bg-stone-800 transition-colors"
              : quiet
          }
        >
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
            href="/farmstand"
            className="text-sm text-stone-500 hover:text-stone-900 font-medium transition-colors"
          >
            Farmstand
          </Link>
          <AccountLinks variant="header" />
        </div>
      </div>
    </nav>
  );
}

function withProtocol(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function socialUrl(value: string, base: string) {
  const v = value.trim();
  if (/^https?:\/\/|\./.test(v)) return withProtocol(v);
  return `${base}${v.replace(/^@/, "")}`;
}

export function StoreFooter() {
  const site = useSite();
  const socials = [
    site.SITE_INSTAGRAM && { label: "Instagram", href: socialUrl(site.SITE_INSTAGRAM, "https://instagram.com/") },
    site.SITE_FACEBOOK && { label: "Facebook", href: socialUrl(site.SITE_FACEBOOK, "https://facebook.com/") },
    site.SITE_WEBSITE && { label: "Website", href: withProtocol(site.SITE_WEBSITE) },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <footer className="border-t border-stone-100 bg-[#FAFAF8]">
      <div className="max-w-5xl mx-auto px-4 py-8 grid gap-6 sm:grid-cols-3 text-sm">
        <div>
          <p className="font-semibold text-stone-900">{site.SITE_NAME}</p>
          <p className="text-xs text-stone-400 mt-0.5">{site.SITE_TAGLINE}</p>
        </div>

        {(site.SITE_PICKUP_INFO || site.SITE_CONTACT_EMAIL || site.SITE_CONTACT_PHONE) && (
          <div className="text-xs text-stone-500 space-y-1">
            {site.SITE_PICKUP_INFO && <p className="whitespace-pre-line">{site.SITE_PICKUP_INFO}</p>}
            {site.SITE_CONTACT_EMAIL && (
              <p>
                <a href={`mailto:${site.SITE_CONTACT_EMAIL}`} className="hover:text-stone-800">
                  {site.SITE_CONTACT_EMAIL}
                </a>
              </p>
            )}
            {site.SITE_CONTACT_PHONE && (
              <p>
                <a href={`tel:${site.SITE_CONTACT_PHONE.replace(/[^\d+]/g, "")}`} className="hover:text-stone-800">
                  {site.SITE_CONTACT_PHONE}
                </a>
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-start gap-x-4 gap-y-2 text-xs text-stone-400 sm:justify-end sm:col-start-3">
          {socials.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className="hover:text-stone-600">
              {s.label}
            </a>
          ))}
          <Link href="/farmstand" className="hover:text-stone-600 transition-colors">
            Farmstand
          </Link>
          <AccountLinks variant="footer" />
        </div>
      </div>
    </footer>
  );
}
