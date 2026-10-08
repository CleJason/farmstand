"use client";

import { useState } from "react";
import { Share } from "lucide-react";
import { useSite } from "@/components/SiteProvider";

/**
 * Share the shop: the phone's share sheet (Messages, Facebook, …) where
 * available, otherwise copy the link.
 */
export default function ShareButton({ className = "" }: { className?: string }) {
  const site = useSite();
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.origin;
    const data = { title: site.SITE_NAME, text: site.SITE_TAGLINE, url };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return; // closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link to share:", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button type="button" onClick={share} className={className} aria-label="Share">
      <Share size={15} aria-hidden />
      <span>{copied ? "Link copied!" : "Share"}</span>
    </button>
  );
}
