"use client";

import { useState } from "react";
import Link from "next/link";
import { useText } from "@/components/SiteProvider";

type Via = "text" | "email" | "both";

const inputClass =
  "min-w-0 text-sm px-4 py-3 border border-stone-300 rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40";

/** "Never miss a drop" sign-up on the home page: by text, email or both. */
export default function DropAlertsSignup() {
  const text = useText();
  const [via, setVia] = useState<Via>("both");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const wantsText = via !== "email";
  const wantsEmail = via !== "text";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          via,
          email: wantsEmail ? email.trim() : undefined,
          phone: wantsText ? phone.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  };

  const choices: [Via, string][] = [
    ["text", text("alerts.viaText")],
    ["email", text("alerts.viaEmail")],
    ["both", text("alerts.viaBoth")],
  ];

  return (
    <section id="alerts" className="scroll-mt-20 border-t border-amber-100 bg-amber-50/60">
      <div className="max-w-xl mx-auto px-4 py-12 text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">{text("alerts.heading")}</h2>
        <div aria-hidden className="mx-auto mt-2 h-1 w-12 rounded-full bg-amber-500/80" />
        {state === "done" ? (
          <div className="mt-5 space-y-2">
            <p className="text-stone-700">{text("alerts.done")}</p>
            {wantsEmail && <p className="text-xs text-stone-500">{text("alerts.doneSpam")}</p>}
          </div>
        ) : (
          <>
            <p className="mt-4 text-stone-600 text-sm">{text("alerts.intro")}</p>
            <form onSubmit={submit} className="mt-5 space-y-2 text-left">
              <div className="flex justify-center gap-2" role="radiogroup" aria-label="How to reach you">
                {choices.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={via === value}
                    onClick={() => setVia(value)}
                    className={`px-4 py-1.5 rounded-full border text-sm font-medium ${
                      via === value ? "bg-amber-600 border-amber-600 text-white" : "bg-white border-stone-300 text-stone-600"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Stacked on phones, side by side on wider screens when both are needed */}
              <div className={`grid gap-2 ${wantsText && wantsEmail ? "sm:grid-cols-2" : ""}`}>
                {wantsEmail && (
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    aria-label="Email"
                    className={inputClass}
                  />
                )}
                {wantsText && (
                  <input
                    type="tel"
                    required
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={text("alerts.phonePlaceholder")}
                    aria-label="Phone"
                    className={inputClass}
                  />
                )}
              </div>
              <button
                disabled={state === "sending"}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold px-6 py-3 rounded-full text-sm shadow-md shadow-amber-600/25"
              >
                {state === "sending" ? text("alerts.sending") : text("alerts.button")}
              </button>
              {error && <p className="text-sm text-red-600 px-2">{error}</p>}
              <p className="text-[11px] text-stone-500 px-2 text-center">
                {text("alerts.fineprint")}{" "}
                <Link href="/privacy" className="underline">
                  {text("footer.privacy")}
                </Link>
                .
              </p>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
