"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

/**
 * The admin menu on phones: a bar that stays at the top while scrolling, with
 * a button that opens the list of pages, so a long page doesn't mean scrolling
 * all the way back up to switch.
 */
export default function AdminMobileMenu({
  siteName,
  items,
  storefrontHref,
  kioskHref,
  version,
}: {
  siteName: string;
  items: { href: string; label: string; icon: string }[];
  storefrontHref: string;
  kioskHref: string;
  version: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="md:hidden sticky top-0 z-40 bg-white border-b border-stone-200">
      <div className="flex items-center justify-between gap-3 px-4 h-14">
        <Link href="/admin" className="min-w-0 font-bold text-stone-900 truncate">
          {siteName}
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="p-2 -mr-2 rounded-lg text-stone-700 hover:bg-stone-100"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <nav className="max-h-[calc(100vh-3.5rem)] overflow-y-auto border-t border-stone-100 p-3 space-y-0.5 shadow-lg bg-white">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium ${
                pathname === item.href ? "bg-amber-50 text-amber-800" : "text-stone-700 hover:bg-stone-50"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
          <div className="flex gap-2 pt-2">
            <Link href={storefrontHref} className="flex-1 text-center text-xs font-medium px-3 py-2 bg-stone-50 rounded-lg text-stone-600">
              ← Storefront
            </Link>
            <Link href={kioskHref} className="flex-1 text-center text-xs font-medium px-3 py-2 bg-amber-50 text-amber-700 rounded-lg">
              Kiosk
            </Link>
          </div>
          <div className="text-[10px] text-stone-300 font-mono pt-1 px-1">v {version}</div>
        </nav>
      )}
    </div>
  );
}
