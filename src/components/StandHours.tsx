"use client";

import { useEffect, useState } from "react";
import { useSite, useText } from "@/components/SiteProvider";
import { hoursLabel } from "@/components/StandHoursEditor";

type Hours = { id: string; startsAt: string; endsAt: string };

/** When the walk-up stand is open next (set in Admin → Porch Pickup). `compact` for the home page. */
export default function StandHours({ compact = false }: { compact?: boolean }) {
  const site = useSite();
  const text = useText();
  const [hours, setHours] = useState<Hours[] | null>(null);

  useEffect(() => {
    fetch("/api/stand-hours")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setHours(Array.isArray(d) ? d : []))
      .catch(() => setHours([]));
  }, []);

  if (hours === null) return null;
  const stand = site.SITE_FARMSTAND_HEADING;
  const openNow = hours.some((h) => new Date(h.startsAt) <= new Date());

  if (compact) {
    if (!hours.length) return null;
    return (
      <p className="mt-3 text-xs text-stone-600">
        <span className="font-semibold">{stand}:</span> {hours.slice(0, 3).map(hoursLabel).join(" · ")}
      </p>
    );
  }

  return (
    <div className="max-w-xl mx-auto mt-3 text-sm bg-[#FAF6F0] border border-[#E8DFD5] rounded-xl px-4 py-3 text-left">
      {hours.length ? (
        <>
          <p className="font-semibold text-[#2D1E18]">
            {openNow ? text("stand.openNow") : text("stand.hoursTitle")}
          </p>
          <ul className="text-[#735D54] mt-1 space-y-0.5">
            {hours.map((h) => (
              <li key={h.id}>{hoursLabel(h)}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[#735D54]">{text("stand.noHours", { stand })}</p>
      )}
    </div>
  );
}
