"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ImageUpload from "@/components/ImageUpload";
import { SITE_DEFAULTS, isHexColor, isOn, type SiteKey, type SiteSettings } from "@/lib/site-defaults";

const inputClass =
  "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500";

type FieldDef = { key: SiteKey; label: string; multiline?: boolean; hint?: string };

const GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Business",
    fields: [
      { key: "SITE_NAME", label: "Business name" },
      { key: "SITE_TAGLINE", label: "Tagline" },
    ],
  },
  {
    title: "Home page",
    fields: [
      { key: "SITE_HEADLINE", label: "Headline" },
      { key: "SITE_INTRO", label: "Intro text", multiline: true },
      { key: "SITE_ABOUT", label: "About section", multiline: true, hint: "Optional. Shown below the intro." },
      { key: "SITE_DROPS_HEADING", label: "Drops heading" },
      { key: "SITE_DROPS_BLURB", label: "Drops description", multiline: true },
    ],
  },
  {
    title: "Farmstand page",
    fields: [
      { key: "SITE_FARMSTAND_HEADING", label: "Heading" },
      { key: "SITE_FARMSTAND_BLURB", label: "Description", multiline: true },
    ],
  },
  {
    title: "Pickup & contact",
    fields: [
      {
        key: "SITE_PICKUP_AREA",
        label: "Pickup area (shown to everyone)",
        hint: "Just the city and state, e.g. Springfield, Ohio.",
      },
      {
        key: "SITE_PICKUP_INFO",
        label: "Exact pickup address & instructions (private)",
        multiline: true,
        hint: "Only shown to customers after they've paid, and included in their confirmation. A drop's pickup day can have its own address instead.",
      },
      { key: "SITE_CONTACT_EMAIL", label: "Contact email", hint: "Shown as an email icon on the home page." },
      { key: "SITE_CONTACT_PHONE", label: "Contact phone", hint: "Shown as a phone icon on the home page." },
    ],
  },
  {
    title: "Social links (username or full link — only filled ones show as icons)",
    fields: [
      { key: "SITE_INSTAGRAM", label: "Instagram" },
      { key: "SITE_FACEBOOK", label: "Facebook" },
      { key: "SITE_TIKTOK", label: "TikTok" },
      { key: "SITE_X", label: "X (Twitter)" },
      { key: "SITE_YOUTUBE", label: "YouTube" },
      { key: "SITE_PINTEREST", label: "Pinterest" },
      { key: "SITE_THREADS", label: "Threads" },
      { key: "SITE_SNAPCHAT", label: "Snapchat" },
      { key: "SITE_BLUESKY", label: "Bluesky" },
      { key: "SITE_ETSY", label: "Etsy shop" },
      { key: "SITE_NEXTDOOR", label: "Nextdoor", hint: "Paste the full link to your Nextdoor page" },
      { key: "SITE_WEBSITE", label: "Other website" },
    ],
  },
];

export default function SiteSettingsForm() {
  const router = useRouter();
  const [values, setValues] = useState<SiteSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/site")
      .then((res) => res.json())
      .then(setValues)
      .catch(() => setValues({ ...SITE_DEFAULTS }));
  }, []);

  const set = (key: SiteKey, value: string) => setValues((v) => (v ? { ...v, [key]: value } : v));

  const save = async (next: SiteSettings) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/site", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save");
      setValues(data);
      setMessage("Saved.");
      router.refresh(); // re-render server parts (header name, brand color)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const toggle = (k: SiteKey, label: string, hint?: string) => (
    <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
      <input
        type="checkbox"
        checked={!!values && isOn(values[k])}
        onChange={(e) => set(k, e.target.checked ? "true" : "false")}
        className="h-4 w-4 accent-amber-600"
      />
      {label}
      {hint && <span className="text-[11px] text-stone-400">({hint})</span>}
    </label>
  );

  if (!values) {
    return (
      <div className="h-24 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(values);
      }}
      className="space-y-6"
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <span className="block text-xs font-medium text-stone-700 mb-1">Logo</span>
          <ImageUpload
            key={values.SITE_LOGO_URL || "none"}
            currentUrl={values.SITE_LOGO_URL || null}
            onUpload={(url) => save({ ...values, SITE_LOGO_URL: url })}
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            hint="PNG, JPG, WebP or SVG · square works best"
            fit="contain"
          />
          {values.SITE_LOGO_URL && (
            <button
              type="button"
              onClick={() => save({ ...values, SITE_LOGO_URL: "" })}
              className="text-xs text-stone-500 underline mt-1"
            >
              Remove logo
            </button>
          )}
        </div>
        <div>
          <span className="block text-xs font-medium text-stone-700 mb-1">Brand color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={isHexColor(values.SITE_BRAND_COLOR) ? values.SITE_BRAND_COLOR : SITE_DEFAULTS.SITE_BRAND_COLOR}
              onChange={(e) => set("SITE_BRAND_COLOR", e.target.value.toUpperCase())}
              className="h-10 w-14 rounded border border-stone-300 cursor-pointer"
            />
            <input
              type="text"
              value={values.SITE_BRAND_COLOR}
              onChange={(e) => set("SITE_BRAND_COLOR", e.target.value)}
              className={`${inputClass} font-mono w-32`}
            />
          </div>
          <span className="block text-[11px] text-stone-400 mt-1">Buttons, links and highlights across the site.</span>
        </div>
      </div>

      {toggle("SITE_LOGO_IN_HEADER", "Show the logo in the header (top-left)", values.SITE_LOGO_URL ? undefined : "upload a logo above")}

      {GROUPS.map((group) => (
        <div key={group.title} className="space-y-3">
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">{group.title}</h3>
          {group.fields.map((f) => (
            <label key={f.key} className="block">
              <span className="block text-xs font-medium text-stone-700 mb-1">{f.label}</span>
              {f.multiline ? (
                <textarea
                  rows={3}
                  value={values[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={SITE_DEFAULTS[f.key]}
                  className={inputClass}
                />
              ) : (
                <input
                  type="text"
                  value={values[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={SITE_DEFAULTS[f.key]}
                  className={inputClass}
                />
              )}
              {f.hint && <span className="block text-[11px] text-stone-400 mt-1">{f.hint}</span>}
            </label>
          ))}
          {group.title === "Business" && (
            <div className="space-y-2">
              <span className="block text-xs font-medium text-stone-700">Use the business name in</span>
              {toggle("SITE_NAME_IN_HEADER", "Header (top-left)")}
              {toggle("SITE_NAME_IN_TAB", "Browser tab title")}
              {toggle("SITE_NAME_IN_NOTIFICATIONS", "Order emails & texts")}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-3 sticky bottom-0 bg-white py-3 border-t border-stone-100">
        <button
          type="submit"
          disabled={saving}
          className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
        >
          {saving ? "Saving..." : "Save site settings"}
        </button>
        {message && <p className="text-xs text-stone-500">{message}</p>}
      </div>
    </form>
  );
}
