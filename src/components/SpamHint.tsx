"use client";

import { useText } from "@/components/SiteProvider";

/** Shown wherever we tell someone an email is on its way: new senders often land in spam at first. */
export default function SpamHint({ className = "" }: { className?: string }) {
  const text = useText();
  return <p className={`text-xs text-stone-500 ${className}`}>{text("spam.hint")}</p>;
}
