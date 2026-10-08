"use client";

import { useEffect, useState } from "react";

const inputClass =
  "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500";

type Values = {
  EMAIL_SERVER_HOST: string;
  EMAIL_SERVER_PORT: string;
  EMAIL_SERVER_USER: string;
  EMAIL_FROM: string;
};

export default function EmailSettings() {
  const [values, setValues] = useState<Values | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = () =>
    fetch("/api/settings/email")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const { hasPassword: hp, ...rest } = data;
        setValues(rest);
        setHasPassword(hp);
        setPassword("");
      })
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const set = (k: keyof Values, v: string) => setValues((cur) => (cur ? { ...cur, [k]: v } : cur));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, EMAIL_SERVER_PASS: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save");
      setMessage("Saved. New sign-in emails use these settings right away.");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  if (!values) return null;

  return (
    <form onSubmit={save} className="space-y-3">
      <p className="text-xs text-stone-500">
        Used to email sign-in links. Use an <strong>app password</strong> from your email provider, not your normal
        password (Gmail: Google Account → Security → App passwords; Zoho: My Account → Security → App Passwords).
      </p>
      <div className="grid grid-cols-3 gap-3">
        <label className="block col-span-2">
          <span className="block text-xs font-medium text-stone-700 mb-1">SMTP server</span>
          <input value={values.EMAIL_SERVER_HOST} onChange={(e) => set("EMAIL_SERVER_HOST", e.target.value)} placeholder="smtp.gmail.com" className={inputClass} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-stone-700 mb-1">Port</span>
          <input value={values.EMAIL_SERVER_PORT} onChange={(e) => set("EMAIL_SERVER_PORT", e.target.value)} placeholder="465" className={inputClass} />
        </label>
      </div>
      <label className="block">
        <span className="block text-xs font-medium text-stone-700 mb-1">Email address (username)</span>
        <input value={values.EMAIL_SERVER_USER} onChange={(e) => set("EMAIL_SERVER_USER", e.target.value)} placeholder="you@example.com" className={inputClass} />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-stone-700 mb-1">App password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={hasPassword ? "•••••••• (leave blank to keep)" : "app password"}
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-stone-700 mb-1">From name &amp; address</span>
        <input value={values.EMAIL_FROM} onChange={(e) => set("EMAIL_FROM", e.target.value)} placeholder="Your Shop <you@example.com>" className={inputClass} />
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
