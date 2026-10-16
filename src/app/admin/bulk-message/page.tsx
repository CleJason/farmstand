"use client";

import { useEffect, useState } from "react";

interface DropOption {
  id: string;
  title: string;
  orderOpenAt: string;
}

interface Counts {
  people: number;
  texts: number;
  emails: number;
  skipped: number;
}

const MAX = 1000;

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function AdminBulkMessagePage() {
  const [drops, setDrops] = useState<DropOption[]>([]);
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [audience, setAudience] = useState<"all" | "skip">("all");
  const [dropId, setDropId] = useState("");
  const [preview, setPreview] = useState<Counts | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    fetch("/api/bulk-message")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: DropOption[]) => {
        setDrops(Array.isArray(d) ? d : []);
        if (Array.isArray(d) && d[0]) setDropId(d[0].id);
      })
      .catch(() => {});
  }, []);

  // Any change means the count has to be checked again before sending
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPreview(null);
    setDone("");
    setError("");
  };

  const skipDropId = audience === "skip" ? dropId : null;

  const post = async (confirm: boolean) => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/bulk-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, subject, skipDropId, confirm }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Something went wrong");
      return null;
    }
    return data as Counts & { sent: boolean };
  };

  const check = async () => {
    const data = await post(false);
    if (data) setPreview(data);
  };

  const send = async () => {
    const data = await post(true);
    if (!data) return;
    setPreview(null);
    setDone(`Sent to ${data.people} ${data.people === 1 ? "person" : "people"} (${data.texts} texts, ${data.emails} emails).`);
    setMessage("");
    setSubject("");
  };

  const canSkip = drops.length > 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Bulk Message</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          One message to everyone on Drop Alerts and the Porch Pickup list. Each person gets it the way they chose (text,
          email or both). Anyone who replied STOP gets the email instead, or nothing if they have no email.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-4">
        <label className="block">
          <span className="block text-xs font-medium text-stone-600 mb-1">Message</span>
          <textarea
            value={message}
            onChange={(e) => edit(setMessage)(e.target.value)}
            maxLength={MAX}
            rows={5}
            placeholder="Fresh sourdough this Saturday at the porch!"
            className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg"
          />
          <span className="block text-[11px] text-stone-400 mt-1">
            {message.trim().length} characters. Texts start with your shop name and end with &quot;Reply STOP to opt
            out.&quot;{message.trim().length > 140 && " Long texts may arrive as more than one message."}
          </span>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-stone-600 mb-1">Email subject (optional)</span>
          <input
            value={subject}
            onChange={(e) => edit(setSubject)(e.target.value)}
            maxLength={150}
            placeholder="News from your shop"
            className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg"
          />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-stone-600 mb-1">Send to</legend>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="radio"
              checked={audience === "all"}
              onChange={() => edit(setAudience)("all")}
              className="h-4 w-4 accent-amber-600"
            />
            All subscribers
          </label>
          <label className={`flex flex-wrap items-center gap-2 text-sm ${canSkip ? "text-stone-700" : "text-stone-400"}`}>
            <input
              type="radio"
              checked={audience === "skip"}
              disabled={!canSkip}
              onChange={() => edit(setAudience)("skip")}
              className="h-4 w-4 accent-amber-600"
            />
            All subscribers minus people who preordered in
            <select
              value={dropId}
              disabled={!canSkip}
              onChange={(e) => {
                edit(setDropId)(e.target.value);
                setAudience("skip");
              }}
              className="text-sm px-2 py-1 border border-stone-200 rounded-lg max-w-full"
            >
              {drops.map((d, i) => (
                <option key={d.id} value={d.id}>
                  {d.title} ({i === 0 ? "latest, " : ""}opened {shortDate(d.orderOpenAt)})
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {done && <p className="text-sm text-green-700 font-medium">✓ {done}</p>}

        {!preview ? (
          <button
            onClick={check}
            disabled={busy || !message.trim()}
            className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2 rounded-lg"
          >
            {busy ? "Counting…" : "Review before sending"}
          </button>
        ) : (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-3">
            <p className="text-sm text-stone-800">
              This goes to <b>{preview.people}</b> {preview.people === 1 ? "person" : "people"}:{" "}
              <b>{preview.texts}</b> texts and <b>{preview.emails}</b> emails.
              {audience === "skip" && ` ${preview.skipped} who preordered are left out.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={send}
                disabled={busy || preview.people === 0}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2 rounded-lg"
              >
                {busy ? "Sending…" : `Yes, send to ${preview.people}`}
              </button>
              <button
                onClick={() => setPreview(null)}
                disabled={busy}
                className="bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 font-semibold text-sm px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
            </div>
            <p className="text-[11px] text-stone-500">
              Texts go out one by one at the pace set in the SMS Gate app; emails a few seconds apart.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
