"use client";

import { useEffect, useState } from "react";
import ImageUpload from "@/components/ImageUpload";
import PaymentSettings from "@/components/PaymentSettings";
import AndroidAppSettings from "@/components/AndroidAppSettings";
import EmailSettings from "@/components/EmailSettings";
import Link from "next/link";

export default function AdminSettingsPage() {
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/branding")
      .then((res) => res.json())
      .then((data) => setFaviconUrl(data.faviconUrl || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveFavicon = async (url: string) => {
    setMessage(null);
    const res = await fetch("/api/settings/branding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faviconUrl: url }),
    });
    if (res.ok) {
      setFaviconUrl(url || null);
      setMessage(url ? "Saved. Refresh any page to see the new tab icon." : "Reset to the default icon.");
    } else {
      setMessage("Couldn't save the icon. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Settings</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Email, payments, notifications and the browser tab icon. Site text, logo and colors are under{" "}
          <Link href="/admin/site" className="text-amber-700 underline">Site</Link>.
        </p>
      </div>

      <section className="bg-white rounded-xl border border-stone-200 p-5 max-w-xl space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">Email (sign-in links)</h2>
        </div>
        <EmailSettings />
      </section>

      <section className="bg-white rounded-xl border border-stone-200 p-5 max-w-xl space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">Payments</h2>
          <p className="text-xs text-stone-500 mt-0.5">How customers pay for orders.</p>
        </div>
        <PaymentSettings />
      </section>

      <section className="bg-white rounded-xl border border-stone-200 p-5 max-w-md space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">Browser tab icon</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            The small icon shown in browser tabs and bookmarks. A square image works best.
          </p>
        </div>

        {loading ? (
          <div className="h-40 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
          </div>
        ) : (
          <ImageUpload
            key={faviconUrl ?? "default"}
            currentUrl={faviconUrl ?? "/icon.png"}
            onUpload={saveFavicon}
            accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
            hint="PNG, ICO or SVG · square, at least 64×64"
            fit="contain"
          />
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-stone-500">{message}</p>
          {faviconUrl && (
            <button
              onClick={() => saveFavicon("")}
              className="text-xs font-medium text-stone-600 hover:text-stone-900 underline shrink-0"
            >
              Use default icon
            </button>
          )}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-stone-200 p-5 max-w-xl space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">Android app</h2>
          <p className="text-xs text-stone-500 mt-0.5">For the admin app (APK) built on GitHub.</p>
        </div>
        <AndroidAppSettings />
      </section>
    </div>
  );
}
