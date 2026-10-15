"use client";

import { useState } from "react";
import { useSite, useText } from "@/components/SiteProvider";

type Via = "text" | "email" | "both";

const inputClass =
  "w-full min-w-0 text-sm px-3.5 py-2.5 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-600";

/** "Let me know when Porch Pickup is open": by text, email or both. */
export default function StandAlertsSignup() {
  const site = useSite();
  const text = useText();
  const [via, setVia] = useState<Via>("text");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const stand = site.SITE_FARMSTAND_HEADING;
  const wantsText = via !== "email";
  const wantsEmail = via !== "text";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError("");
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        list: "stand",
        via,
        phone: wantsText ? phone.trim() : undefined,
        email: wantsEmail ? email.trim() : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Something went wrong");
      setState("idle");
      return;
    }
    setState("done");
  };

  const choices: [Via, string][] = [
    ["text", text("stand.viaText")],
    ["email", text("stand.viaEmail")],
    ["both", text("stand.viaBoth")],
  ];

  return (
    <section className="max-w-xl mx-auto px-4 pb-6">
      <div className="bg-white rounded-2xl border border-stone-200 p-5 text-center space-y-3">
        <h2 className="font-bold text-[#2D1E18]">{text("stand.alertsTitle", { stand })}</h2>
        {state === "done" ? (
          <p className="text-sm text-[#735D54]">{text("stand.alertsDone", { stand })}</p>
        ) : (
          <form onSubmit={submit} className="space-y-2 text-left">
            <div className="flex justify-center gap-2" role="radiogroup">
              {choices.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={via === value}
                  onClick={() => setVia(value)}
                  className={`px-3.5 py-1.5 rounded-full border text-sm font-medium ${
                    via === value ? "bg-amber-600 border-amber-600 text-white" : "border-stone-200 text-stone-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {wantsText && (
              <input
                type="tel"
                required
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={text("stand.phonePlaceholder")}
                className={inputClass}
              />
            )}
            {wantsEmail && (
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={text("stand.emailPlaceholder")}
                className={inputClass}
              />
            )}
            <button
              disabled={state === "sending"}
              className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-xl"
            >
              {text("stand.alertsButton")}
            </button>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <p className="text-[11px] text-stone-400 text-center">{text("stand.alertsFine")}</p>
          </form>
        )}
      </div>
    </section>
  );
}
