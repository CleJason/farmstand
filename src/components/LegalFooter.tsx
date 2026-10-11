"use client";

import Link from "next/link";
import { useSite } from "@/components/SiteProvider";

/** Small footer on customer pages: © line plus Privacy and Terms links. */
export default function LegalFooter() {
  const site = useSite();
  return (
    <footer className="border-t border-stone-100 py-6 px-4 text-center text-xs text-stone-400">
      © {new Date().getFullYear()} {site.SITE_NAME}
      <span className="mx-2">·</span>
      {/* Always a way home (the installed app has no browser back button) */}
      <Link href="/" className="hover:text-stone-700 underline-offset-2 hover:underline">
        Home
      </Link>
      <span className="mx-2">·</span>
      <Link href="/privacy" className="hover:text-stone-700 underline-offset-2 hover:underline">
        Privacy Policy
      </Link>
      <span className="mx-2">·</span>
      <Link href="/terms" className="hover:text-stone-700 underline-offset-2 hover:underline">
        Terms
      </Link>
    </footer>
  );
}
