"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSite, useText } from "@/components/SiteProvider";

// Facebook, Messenger and Instagram open links in their own built-in browser
const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger/i;
const TRIED = "escapeInAppBrowserTried";
const STAY = "stayInAppBrowser";

/**
 * Gets customers out of the Facebook/Instagram built-in browser before they
 * shop (checkout, Apple Pay and saved cards work properly in the real browser).
 * Android: hands the page to Chrome automatically. iPhone: tries Safari, and
 * covers the page with an "Open in Safari" screen so nobody fills a cart here
 * only to start over in Safari.
 */
export default function InAppBrowserEscape() {
  const site = useSite();
  const text = useText();
  const pathname = usePathname();
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [stay, setStay] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    if (!IN_APP.test(ua) || pathname.startsWith("/admin")) return;
    const android = /Android/i.test(ua);
    const ios = /iPhone|iPad|iPod/i.test(ua);
    let tried = false;
    let stayed = false;
    try {
      tried = sessionStorage.getItem(TRIED) === "1";
      stayed = sessionStorage.getItem(STAY) === "1";
      sessionStorage.setItem(TRIED, "1");
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the browser, only on the client
    setPlatform(android ? "android" : ios ? "ios" : null);
    setStay(stayed);
    if (!tried) window.location.href = escapeUrl(android ? "android" : "ios");
  }, [pathname]);

  if (!platform || stay) return null;

  // Android usually switches to Chrome right away; if not, a slim bar offers it
  if (platform === "android") {
    return (
      <div className="sticky top-0 z-[60] bg-stone-900 text-white text-xs px-3 py-2 flex items-center gap-2">
        <span className="flex-1">{text("inapp.text")}</span>
        <a href={escapeUrl("android")} className="shrink-0 bg-white text-stone-900 font-semibold rounded-full px-3 py-1">
          {text("inapp.chrome")}
        </a>
      </div>
    );
  }

  // iPhone: cover the page until they open Safari
  return (
    <div className="fixed inset-0 z-[100] bg-[#FAF6F0] flex items-center justify-center p-6 text-center">
      <div className="max-w-sm space-y-4">
        {site.SITE_LOGO_URL && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={site.SITE_LOGO_URL} alt="" className="h-20 w-20 mx-auto object-contain" />
        )}
        <h1 className="text-xl font-bold text-stone-900">{text("inapp.gateTitle")}</h1>
        <p className="text-sm text-stone-600">{text("inapp.gateText")}</p>
        <a
          href={escapeUrl("ios")}
          className="block w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl"
        >
          {text("inapp.safari")}
        </a>
        <p className="text-xs text-stone-500">{text("inapp.gateHelp")}</p>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setCopied(true);
            } catch {
              window.prompt("Copy this link:", window.location.href);
            }
          }}
          className="text-sm font-semibold text-amber-700 underline"
        >
          {copied ? text("nav.shareCopied") : text("inapp.copy")}
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.setItem(STAY, "1");
            } catch {}
            setStay(true);
          }}
          className="block mx-auto text-[11px] text-stone-400 underline"
        >
          {text("inapp.stay")}
        </button>
      </div>
    </div>
  );
}

function escapeUrl(platform: "ios" | "android") {
  const { host, pathname, search, href } = window.location;
  return platform === "ios"
    ? `x-safari-https://${host}${pathname}${search}`
    : `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}
