"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, Menu, MessageCircle, Sun, X } from "lucide-react";

/**
 * The admin menu on phones: tabs along the bottom for the main pages, and
 * More, which opens the full list of pages above them. The top bar just shows
 * the shop's name.
 */
export default function AdminMobileMenu({
  siteName,
  items,
  storefrontHref,
  kioskHref,
  version,
  unreadTexts = 0,
}: {
  siteName: string;
  items: { href: string; label: string; icon: string }[];
  storefrontHref: string;
  kioskHref: string;
  version: string;
  unreadTexts?: number;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  const tabs = [
    { href: "/admin/today", label: "Today", Icon: Sun },
    { href: "/admin", label: "Orders", Icon: ClipboardList },
    { href: "/admin/messages", label: "Messages", Icon: MessageCircle, badge: unreadTexts },
    { href: "/admin/drops", label: "Drops", Icon: CalendarDays },
  ];
  const onTab = tabs.some((t) => t.href === pathname);

  return (
    <>
    {/* The main pages one tap away at the bottom; More opens the full menu */}
    <nav className="md:hidden print:hidden fixed bottom-0 inset-x-0 z-40 bg-white/85 backdrop-blur-md border-t border-stone-200 grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
      {tabs.map(({ href, label, Icon, badge }) => (
        <Link
          key={href}
          href={href}
          className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
            pathname === href && !open ? "text-amber-700" : "text-stone-500"
          }`}
        >
          <Icon size={22} />
          {label}
          {!!badge && (
            <span className="absolute top-1 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-amber-600 text-white text-[10px] leading-4 text-center">
              {badge}
            </span>
          )}
        </Link>
      ))}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${open || !onTab ? "text-amber-700" : "text-stone-500"}`}
      >
        {open ? <X size={22} /> : <Menu size={22} />}
        More
      </button>
    </nav>
    <div className="md:hidden print:hidden sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-stone-200">
      <div className="flex items-center justify-between gap-3 px-4 h-14">
        <Link href="/admin" className="min-w-0 font-bold text-stone-900 truncate">
          {siteName}
        </Link>
      </div>
    </div>
      {/* "More": the full menu, opening up from the bottom tabs */}
      {open && (
        <>
        <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="md:hidden print:hidden fixed inset-0 z-30 bg-black/30" />
        <nav className="md:hidden print:hidden fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 max-h-[calc(100vh-8rem)] overflow-y-auto border-t border-stone-200 rounded-t-2xl p-3 space-y-0.5 shadow-2xl bg-white">
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
        </>
      )}
    </>
  );
}
