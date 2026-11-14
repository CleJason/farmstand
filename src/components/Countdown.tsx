"use client";

import { useEffect, useState } from "react";
import { useText } from "@/components/SiteProvider";

/**
 * Time left until `to`, e.g. "· 1d 4h left", kept current every 30 seconds.
 * Nothing shows on the server render (no clock mismatch), when it's passed,
 * or when it's over a week away.
 */
export default function Countdown({ to, className }: { to: string; className?: string }) {
  const text = useText();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  if (now === null) return null;
  const ms = new Date(to).getTime() - now;
  if (!(ms > 0) || ms > 7 * 86_400_000) return null;
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const time = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
  return <span className={className}> · {text("countdown.left", { time })}</span>;
}
