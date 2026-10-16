"use client";

import { useEffect, useState } from "react";
import { useSite } from "@/components/SiteProvider";

type Hours = { id: string; startsAt: string; endsAt: string };

const inputClass = "w-full text-sm px-3 py-2 border border-stone-200 rounded-lg";

const pad = (n: number) => String(n).padStart(2, "0");
const dateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const at = (date: string, time: string) => new Date(`${date}T${time}`);

/** "Sat, Oct 18 · 9:00 AM–2:00 PM" in the viewer's own timezone. */
export function hoursLabel(h: { startsAt: string; endsAt: string }) {
  const s = new Date(h.startsAt);
  const e = new Date(h.endsAt);
  const day = s.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${t(s)}–${t(e)}`;
}

/**
 * Admin → Porch Pickup: the days and times it's open this week (any number,
 * past ones drop off on their own), and the button that texts the people who
 * asked to hear when it's open.
 */
export default function StandHoursEditor() {
  const site = useSite();
  const [hours, setHours] = useState<Hours[]>([]);
  const [listCount, setListCount] = useState<number | null>(null);
  const [drops, setDrops] = useState<{ id: string; title: string }[]>([]);
  const [skipDropId, setSkipDropId] = useState(""); // "" = everyone
  const [editing, setEditing] = useState<string | null>(null); // id, or "new"
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("14:00");
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetch("/api/stand-hours")
      .then((r) => r.json())
      .then((d) => setHours(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch("/api/subscribers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setListCount(Array.isArray(d) ? d.length : 0))
      .catch(() => {});
  };
  useEffect(load, []);
  useEffect(() => {
    fetch("/api/bulk-message")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setDrops(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const startNew = () => {
    setEditing("new");
    setDate(dateInput(new Date()));
    setFrom("09:00");
    setTo("14:00");
  };
  const startEdit = (h: Hours) => {
    setEditing(h.id);
    setDate(dateInput(new Date(h.startsAt)));
    setFrom(timeInput(new Date(h.startsAt)));
    setTo(timeInput(new Date(h.endsAt)));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body = { id: editing, startsAt: at(date, from).toISOString(), endsAt: at(date, to).toISOString() };
    const res = await fetch("/api/stand-hours", {
      method: editing === "new" ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return alert(data.error || "Couldn't save");
    setEditing(null);
    load();
  };

  const remove = async (h: Hours) => {
    if (!confirm(`Remove ${hoursLabel(h)}?`)) return;
    await fetch(`/api/stand-hours?id=${encodeURIComponent(h.id)}`, { method: "DELETE" });
    load();
  };

  const notify = async () => {
    const post = (confirm: boolean) =>
      fetch("/api/stand-hours/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipDropId: skipDropId || null, confirm }),
      });
    setBusy(true);
    // Count first, so the confirm says exactly who gets it
    const check = await post(false);
    const counts = await check.json().catch(() => ({}));
    setBusy(false);
    if (!check.ok) return alert(counts.error || "Couldn't count the subscribers");
    const orders: { name: string; subscribed: boolean }[] = counts.orders ?? [];
    const skipped = skipDropId
      ? `\n\nOrders in that drop:\n${
          orders.map((o) => `• ${o.name}: ${o.subscribed ? "left out" : "not on the subscriber list"}`).join("\n") || "none"
        }`
      : "";
    if (
      !confirm(
        `Tell ${counts.people} ${counts.people === 1 ? "person" : "people"} (${counts.texts} texts, ${counts.emails} emails) that ${site.SITE_FARMSTAND_HEADING} is open:\n\n${hours
          .map(hoursLabel)
          .join("\n")}${skipped}\n\nSend it?`
      )
    )
      return;
    setBusy(true);
    const res = await post(true);
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    alert(
      res.ok
        ? `Sent: ${data.texts} ${data.texts === 1 ? "text" : "texts"} and ${data.emails} ${data.emails === 1 ? "email" : "emails"}.`
        : data.error || "Couldn't send it"
    );
  };

  return (
    <section className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">Open days &amp; times</h2>
          <p className="text-[11px] text-stone-500">
            Shown on the {site.SITE_FARMSTAND_HEADING} page and the home page. Past ones disappear on their own.
          </p>
        </div>
        {editing === null && (
          <button onClick={startNew} className="text-xs font-semibold text-amber-700 hover:underline">
            + Add a day
          </button>
        )}
      </div>

      {hours.length === 0 && editing === null && (
        <p className="text-sm text-stone-500">None scheduled. Customers see &quot;No {site.SITE_FARMSTAND_HEADING} scheduled right now&quot;.</p>
      )}

      <ul className="divide-y divide-stone-100">
        {hours.map((h) => (
          <li key={h.id} className="py-2 flex items-center justify-between gap-2 text-sm">
            <span className="text-stone-800">{hoursLabel(h)}</span>
            <span className="flex gap-3 text-xs">
              <button onClick={() => startEdit(h)} className="text-stone-500 hover:text-stone-900">
                Edit
              </button>
              <button onClick={() => remove(h)} className="text-stone-400 hover:text-red-600">
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>

      {editing !== null && (
        <form onSubmit={save} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end bg-stone-50 rounded-lg p-3">
          <label className="col-span-2 sm:col-span-1">
            <span className="block text-[11px] text-stone-500 mb-0.5">Day</span>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>
          <label>
            <span className="block text-[11px] text-stone-500 mb-0.5">Opens</span>
            <input type="time" required value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </label>
          <label>
            <span className="block text-[11px] text-stone-500 mb-0.5">Closes</span>
            <input type="time" required value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </label>
          <div className="col-span-2 sm:col-span-1 flex gap-2">
            <button
              disabled={busy}
              className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg"
            >
              Save
            </button>
            <button type="button" onClick={() => setEditing(null)} className="text-sm text-stone-500 px-2">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="border-t border-stone-100 pt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-stone-500">
          {listCount === null ? "…" : `${listCount} ${listCount === 1 ? "subscriber" : "subscribers"}`} (anyone who signed
          up on the home page, the {site.SITE_FARMSTAND_HEADING} page, or at checkout).
        </p>
        <select
          value={skipDropId}
          onChange={(e) => setSkipDropId(e.target.value)}
          className="text-xs px-2 py-1.5 border border-stone-200 rounded-lg max-w-full"
        >
          <option value="">Everyone</option>
          {drops.map((d, i) => (
            <option key={d.id} value={d.id}>
              Everyone except people who ordered from {d.title}
              {i === 0 ? " (latest)" : ""}
            </option>
          ))}
        </select>
        <button
          onClick={notify}
          disabled={busy || hours.length === 0 || !listCount}
          className="text-xs font-semibold px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg disabled:opacity-50"
        >
          📣 Notify subscribers
        </button>
      </div>
    </section>
  );
}
