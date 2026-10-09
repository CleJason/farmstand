"use client";

import { useEffect, useState } from "react";

/** Admin → Settings: the public address used in emails, gift cards, alerts and share previews. */
export default function SiteUrlSettings() {
  const [appUrl, setAppUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/site-url")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: { appUrl?: string }) => setAppUrl(d.appUrl || ""))
      .catch(() => {});
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/settings/site-url", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appUrl }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setAppUrl(data.appUrl);
      setMessage("Saved.");
    } else {
      setMessage(data.error || "Couldn't save.");
    }
    setSaving(false);
  };

  const looksLikeIp = /^https?:\/\/(\d{1,3}\.){3}\d{1,3}|localhost/.test(appUrl);

  return (
    <form onSubmit={save} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="url"
          required
          value={appUrl}
          onChange={(e) => setAppUrl(e.target.value)}
          placeholder="https://shop.yourdomain.com"
          className="flex-1 min-w-0 text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
        />
        <button
          disabled={saving}
          className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2 rounded-lg"
        >
          Save
        </button>
      </div>
      {looksLikeIp && (
        <p className="text-xs text-amber-700">
          This is a home-network address, so links in emails won&apos;t work for customers. Use your public web address.
        </p>
      )}
      <p className="text-xs text-stone-500">
        Used for links in emails (gift cards, drop alerts, order emails), share previews and the Stripe webhook. Sign-in
        links use the container&apos;s Public URL setting (NEXTAUTH_URL); set that to the same address.
      </p>
      {message && <p className="text-xs text-stone-600">{message}</p>}
    </form>
  );
}
