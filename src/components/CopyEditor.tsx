"use client";

import { useMemo, useState } from "react";
import { COPY, parseCopy, type CopyKey, type CopyOverrides } from "@/lib/copy";
import { useSite } from "@/components/SiteProvider";
import { standHref } from "@/lib/site-defaults";

const inputClass =
  "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500";

const KEYS = Object.keys(COPY) as CopyKey[];
const GROUPS = [...new Set(KEYS.map((k) => COPY[k].group))];

/** Where each section shows up, and how to get there. */
function previewFor(group: string, stand: string): { href: string; how?: string }[] {
  switch (group) {
    case "Menu & footer":
    case "Home page":
      return [{ href: "/" }];
    case "Pre-order page":
    case "Boxes & add-ons":
      return [{ href: "/#drops", how: "open a drop" }];
    case "Walk-up page":
      return [{ href: stand }];
    case "Checkout":
      return [{ href: stand, how: "add an item, choose Card, tap Pay; close before paying and no order is made" }];
    case "Gift card page":
      return [{ href: "/gift" }];
    case "Sign in & My orders":
      return [{ href: "/my-orders" }, { href: "/login" }];
    case "Review form":
      return [{ href: "/review?preview=1" }];
    default:
      return [];
  }
}

/**
 * Admin → Site → Text & buttons: every customer-facing label, grouped by page.
 * Empty = the default wording. Edits live in the site form until Save.
 */
export default function CopyEditor({ value, onChange }: { value: string; onChange: (json: string) => void }) {
  const stand = standHref(useSite());
  const overrides = useMemo(() => parseCopy(value), [value]);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const changed = Object.keys(overrides).length;

  const set = (key: CopyKey, text: string) => {
    const next: CopyOverrides = { ...overrides };
    // Keep what they type (even blank while typing); blanks are dropped on save
    if (text && text !== COPY[key].default) next[key] = text;
    else delete next[key];
    onChange(Object.keys(next).length ? JSON.stringify(next) : "");
  };

  const matches = (k: CopyKey) =>
    !q ||
    COPY[k].label.toLowerCase().includes(q) ||
    COPY[k].default.toLowerCase().includes(q) ||
    (overrides[k] ?? "").toLowerCase().includes(q);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-stone-500">
        Change any wording customers see. Leave a box empty to use the default (shown in grey). Words in{" "}
        <span className="font-mono">{"{curly}"}</span> brackets are filled in for you, e.g.{" "}
        <span className="font-mono">{"{count}"}</span>, <span className="font-mono">{"{shop}"}</span> or{" "}
        <span className="font-mono">{"{total}"}</span>. {changed > 0 && <b>{changed} changed.</b>}
      </p>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search, e.g. checkout or Venmo"
        className={inputClass}
      />
      {GROUPS.map((group) => {
        const keys = KEYS.filter((k) => COPY[k].group === group && matches(k));
        if (!keys.length) return null;
        const groupChanged = keys.filter((k) => overrides[k]).length;
        return (
          <details key={group} open={!!q} className="rounded-lg border border-stone-200 bg-stone-50/50">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-stone-800">
              {group}
              {groupChanged > 0 && <span className="ml-2 text-xs font-normal text-amber-700">{groupChanged} changed</span>}
            </summary>
            <div className="space-y-3 px-3 pb-3">
              <p className="text-[11px] text-stone-500">
                Save, then preview:{" "}
                {previewFor(group, stand).map((p, i) => (
                  <span key={p.href}>
                    {i > 0 && " · "}
                    <a href={p.href} target="_blank" rel="noopener" className="font-medium text-amber-700 underline">
                      {p.href.replace("?preview=1", "")} ↗
                    </a>
                    {p.how && ` (${p.how})`}
                  </span>
                ))}
              </p>
              {keys.map((k) => {
                const entry = COPY[k];
                const long = "long" in entry && entry.long;
                return (
                  <label key={k} className="block">
                    <span className="flex items-center justify-between gap-2 text-xs font-medium text-stone-700 mb-1">
                      {entry.label}
                      {overrides[k] && (
                        <button
                          type="button"
                          onClick={() => set(k, "")}
                          className="text-[11px] font-normal text-stone-500 underline"
                        >
                          Reset
                        </button>
                      )}
                    </span>
                    {long ? (
                      <textarea
                        rows={3}
                        value={overrides[k] ?? ""}
                        onChange={(e) => set(k, e.target.value)}
                        placeholder={entry.default}
                        className={`${inputClass} bg-white`}
                      />
                    ) : (
                      <input
                        type="text"
                        value={overrides[k] ?? ""}
                        onChange={(e) => set(k, e.target.value)}
                        placeholder={entry.default}
                        className={`${inputClass} bg-white`}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
