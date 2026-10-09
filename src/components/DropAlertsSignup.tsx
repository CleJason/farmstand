"use client";

import { useState } from "react";
import Link from "next/link";

/** "Never miss a drop" sign-up on the home page. */
export default function DropAlertsSignup() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone: phone || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  };

  return (
    <section id="alerts" className="scroll-mt-20 border-t border-amber-100 bg-amber-50/60">
      <div className="max-w-xl mx-auto px-4 py-12 text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">Never miss a drop</h2>
        <div aria-hidden className="mx-auto mt-2 h-1 w-12 rounded-full bg-amber-500/80" />
        {state === "done" ? (
          <div className="mt-5 space-y-2">
            <p className="text-stone-700">You&apos;re on the list! We&apos;ll email you when the next drop opens. 🎉</p>
            <p className="text-xs text-stone-500">
              Alerts can land in spam or promotions at first. If you find one there, mark it &quot;Not spam&quot; so you
              don&apos;t miss the next drop.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-4 text-stone-600 text-sm">Get a heads-up as soon as ordering opens.</p>
            <form onSubmit={submit} className="mt-5 space-y-2 text-left">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email"
                  className="flex-1 min-w-0 text-sm px-4 py-3 border border-stone-300 rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
                <button
                  disabled={state === "sending"}
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold px-6 py-3 rounded-full text-sm shadow-md shadow-amber-600/25"
                >
                  {state === "sending" ? "Signing up…" : "Notify me"}
                </button>
              </div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone for text alerts (optional)"
                aria-label="Phone (optional)"
                className="w-full text-sm px-4 py-3 border border-stone-300 rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
              {error && <p className="text-sm text-red-600 px-2">{error}</p>}
              <p className="text-[11px] text-stone-500 px-2 text-center">
                Unsubscribe anytime from any alert. If you add a phone number, you agree to get texts about new drops; msg
                &amp; data rates may apply, reply STOP to opt out. See our{" "}
                <Link href="/privacy" className="underline">
                  Privacy Policy
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
