"use client";

import { useEffect, useState } from "react";

const inputClass =
  "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500";

export default function AndroidAppSettings() {
  const [packageId, setPackageId] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/android")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setPackageId(data.packageId || "");
        setFingerprint(data.fingerprint || "");
      })
      .catch(() => {});
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/android", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, fingerprint }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save");
      setMessage("Saved. Reopen the app to drop the browser bar.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <p className="text-xs text-stone-500">
        After building the Android app on GitHub, copy the package and fingerprint from the build summary here so the
        app opens full-screen without a browser bar.
      </p>
      <label className="block">
        <span className="block text-xs font-medium text-stone-700 mb-1">Package</span>
        <input value={packageId} onChange={(e) => setPackageId(e.target.value)} placeholder="com.example.shop.admin" className={inputClass} />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-stone-700 mb-1">Signing certificate SHA-256</span>
        <input value={fingerprint} onChange={(e) => setFingerprint(e.target.value)} placeholder="AB:CD:EF:…" className={inputClass} />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2 rounded-lg"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {message && <p className="text-xs text-stone-500">{message}</p>}
      </div>
    </form>
  );
}
