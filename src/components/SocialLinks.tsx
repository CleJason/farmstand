"use client";

import {
  siBluesky,
  siEtsy,
  siFacebook,
  siInstagram,
  siNextdoor,
  siPinterest,
  siSnapchat,
  siThreads,
  siTiktok,
  siX,
  siYoutube,
  type SimpleIcon,
} from "simple-icons";
import { useState } from "react";
import { Globe, Mail, Phone } from "lucide-react";
import { useSite } from "@/components/SiteProvider";
import type { SiteKey } from "@/lib/site-defaults";

type Network = { key: SiteKey; label: string; icon: SimpleIcon; base: string };

// Handle → profile URL for each network
const NETWORKS: Network[] = [
  { key: "SITE_INSTAGRAM", label: "Instagram", icon: siInstagram, base: "https://instagram.com/" },
  { key: "SITE_FACEBOOK", label: "Facebook", icon: siFacebook, base: "https://facebook.com/" },
  { key: "SITE_TIKTOK", label: "TikTok", icon: siTiktok, base: "https://tiktok.com/@" },
  { key: "SITE_X", label: "X", icon: siX, base: "https://x.com/" },
  { key: "SITE_YOUTUBE", label: "YouTube", icon: siYoutube, base: "https://youtube.com/@" },
  { key: "SITE_PINTEREST", label: "Pinterest", icon: siPinterest, base: "https://pinterest.com/" },
  { key: "SITE_THREADS", label: "Threads", icon: siThreads, base: "https://threads.net/@" },
  { key: "SITE_SNAPCHAT", label: "Snapchat", icon: siSnapchat, base: "https://snapchat.com/add/" },
  { key: "SITE_BLUESKY", label: "Bluesky", icon: siBluesky, base: "https://bsky.app/profile/" },
  { key: "SITE_ETSY", label: "Etsy", icon: siEtsy, base: "https://etsy.com/shop/" },
  { key: "SITE_NEXTDOOR", label: "Nextdoor", icon: siNextdoor, base: "https://nextdoor.com/pages/" },
];

/** A full link ("https://…" or "site.com/path") is used as-is; anything else is a handle. */
function profileUrl(value: string, base: string) {
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (v.includes("/")) return `https://${v}`;
  return base + v.replace(/^@/, "");
}

/**
 * mailto: links do nothing when the visitor has no email app set up (common
 * with webmail), so show the address with Copy and "Open email app" instead.
 */
function EmailButton({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this email address:", email);
    }
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Email" title={email} aria-expanded={open} className={circle}>
        <Mail size={18} />
      </button>
      {open && (
        <div className="absolute z-20 top-12 left-1/2 -translate-x-1/2 w-64 bg-white border border-stone-200 rounded-xl shadow-lg p-3 space-y-2 text-left">
          <p className="text-sm font-medium text-stone-900 break-all">{email}</p>
          <div className="flex gap-2">
            <button type="button" onClick={copy} className="flex-1 text-xs font-semibold border border-stone-200 rounded-lg py-1.5 hover:bg-stone-50">
              {copied ? "Copied!" : "Copy"}
            </button>
            <a href={`mailto:${email}`} className="flex-1 text-center text-xs font-semibold bg-amber-600 text-white rounded-lg py-1.5 hover:bg-amber-700">
              Open email app
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

const circle =
  "w-11 h-11 rounded-full bg-white border border-stone-200 shadow-sm text-stone-600 hover:text-white hover:bg-amber-600 hover:border-amber-600 hover:-translate-y-0.5 flex items-center justify-center transition-all";

/** Icons for every social link and contact method the owner filled in (none shown if empty). */
export default function SocialLinks({ className = "" }: { className?: string }) {
  const site = useSite();
  const socials = NETWORKS.filter((n) => site[n.key].trim());
  const website = site.SITE_WEBSITE.trim();
  const email = site.SITE_CONTACT_EMAIL.trim();
  const phone = site.SITE_CONTACT_PHONE.trim();
  if (!socials.length && !website && !email && !phone) return null;

  return (
    <div className={`flex flex-wrap justify-center gap-2 ${className}`}>
      {socials.map((n) => (
        <a
          key={n.key}
          href={profileUrl(site[n.key], n.base)}
          target="_blank"
          rel="noreferrer"
          aria-label={n.label}
          title={n.label}
          className={circle}
        >
          <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor" aria-hidden>
            <path d={n.icon.path} />
          </svg>
        </a>
      ))}
      {website && (
        <a href={profileUrl(website, "https://")} target="_blank" rel="noreferrer" aria-label="Website" title="Website" className={circle}>
          <Globe size={18} />
        </a>
      )}
      {email && <EmailButton email={email} />}
      {phone && (
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} aria-label="Call" title={phone} className={circle}>
          <Phone size={18} />
        </a>
      )}
    </div>
  );
}
