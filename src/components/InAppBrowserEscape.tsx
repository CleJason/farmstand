"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useText } from "@/components/SiteProvider";

// Facebook, Messenger and Instagram open links in their own built-in browser
const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger/i;
const TRIED = "escapeInAppBrowserTried";

/**
 * Opens the shop in the phone's real browser when someone taps a link inside
 * Facebook or Instagram (checkout, Apple Pay and saved cards work better there).
 * Android: done automatically through Chrome. iPhone: apps don't allow that
 * automatically, so a banner offers a one-tap "Open in Safari".
 */
export default function InAppBrowserEscape() {
  const text = useText();
  const pathname = usePathname();
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    if (!IN_APP.test(ua) || pathname.startsWith("/admin")) return;
    const android = /Android/i.test(ua);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the browser, only on the client
    setPlatform(android ? "android" : /iPhone|iPad|iPod/i.test(ua) ? "ios" : null);

    let tried = false;
    try {
      tried = sessionStorage.getItem(TRIED) === "1";
      sessionStorage.setItem(TRIED, "1");
    } catch {}
    if (android && !tried) {
      // Hand this page to Chrome (falls back to staying here if Chrome isn't installed)
      const url = new URL(window.location.href);
      window.location.href = `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
    }
  }, [pathname]);

  if (!platform || hidden) return null;
  const href =
    platform === "ios"
      ? `x-safari-https://${typeof window !== "undefined" ? window.location.host + window.location.pathname + window.location.search : ""}`
      : typeof window !== "undefined"
        ? `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;package=com.android.chrome;end`
        : "#";

  return (
    <div className="sticky top-0 z-[60] bg-stone-900 text-white text-xs px-3 py-2 flex items-center gap-2">
      <span className="flex-1">{text("inapp.text")}</span>
      <a href={href} className="shrink-0 bg-white text-stone-900 font-semibold rounded-full px-3 py-1">
        {platform === "ios" ? text("inapp.safari") : text("inapp.chrome")}
      </a>
      <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss" className="shrink-0 px-1 text-white/70">
        ✕
      </button>
    </div>
  );
}
