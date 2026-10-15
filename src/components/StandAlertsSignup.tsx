"use client";

import { useState } from "react";
import { useSite, useText } from "@/components/SiteProvider";

/** "Get a text when Porch Pickup is open": phone (or email) for the walk-up stand's alert list. */
export default function StandAlertsSignup() {
  const site = useSite();
  const text = useText();
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const stand = site.SITE_FARMSTAND_HEADING;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError("");
    const value = contact.trim();
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ list: "stand", ...(value.includes("@") ? { email: value } : { phone: value }) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Something went wrong");
      setState("idle");
      return;
    }
    setState("done");
  };

  return (
    <section className="max-w-xl mx-auto px-4 pb-6">
      <div className="bg-white rounded-2xl border border-stone-200 p-5 text-center space-y-3">
        <h2 className="font-bold text-[#2D1E18]">{text("stand.alertsTitle", { stand })}</h2>
        {state === "done" ? (
          <p className="text-sm text-[#735D54]">{text("stand.alertsDone", { stand })}</p>
        ) : (
          <form onSubmit={submit} className="space-y-2">
            <div className="flex gap-2">
              <input
                required
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={text("stand.alertsPlaceholder")}
                inputMode="tel"
                className="flex-1 min-w-0 text-sm px-3.5 py-2.5 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-600"
              />
              <button
                disabled={state === "sending"}
                className="shrink-0 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm px-4 rounded-xl"
              >
                {text("stand.alertsButton")}
              </button>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <p className="text-[11px] text-stone-400">{text("stand.alertsFine")}</p>
          </form>
        )}
      </div>
    </section>
  );
}
