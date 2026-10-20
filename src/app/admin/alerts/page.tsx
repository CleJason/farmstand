"use client";

import { useEffect, useState } from "react";

interface Subscriber {
  id: string;
  name: string | null; // looked up from customers/orders
  email: string | null; // null = phone only
  phone: string | null;
  createdAt: string;
  dropVia: string | null; // text | email | both; empty = signed up before there was a choice
  stopped?: boolean; // replied STOP: no texts until they reply START
}

/** How they get drop alerts, for the list. */
const getsLabel = (s: Subscriber) =>
  s.dropVia === "text" ? "Text" : s.dropVia === "email" ? "Email" : s.dropVia === "both" ? "Text + email" : s.email && s.phone ? "Email + text" : s.email ? "Email" : "Text";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function AdminAlertsPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [reminder, setReminder] = useState<{ enabled: boolean; hours: number } | null>(null);
  const [reminderMsg, setReminderMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings/reminders")
      .then((r) => (r.ok ? r.json() : null))
      .then(setReminder)
      .catch(() => {});
  }, []);

  const saveReminder = async (next: { enabled: boolean; hours: number }) => {
    setReminder(next);
    setReminderMsg("");
    const res = await fetch("/api/settings/reminders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const data = await res.json().catch(() => ({}));
    setReminderMsg(res.ok ? "Saved." : data.error || "Couldn't save");
    if (res.ok) setReminder(data);
  };

  const load = () =>
    fetch("/api/subscribers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSubscribers(Array.isArray(d) ? d : []))
      .catch(() => setSubscribers([]))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const remove = async (s: Subscriber) => {
    if (!confirm(`Remove ${s.name ?? s.email ?? s.phone} from the list? (No more drop alerts or Porch Pickup notices.)`)) return;
    const res = await fetch(`/api/subscribers?id=${encodeURIComponent(s.id)}`, { method: "DELETE" });
    if (res.ok) load();
    else alert("Couldn't remove them");
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    const res = await fetch("/api/subscribers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail.trim(), phone: newPhone.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setAdding(false);
    if (!res.ok) return alert(data.error || "Couldn't add them");
    setNewEmail("");
    setNewPhone("");
    load();
  };

  // Fixing someone's email/phone in place (e.g. a misspelled email that bounces)
  const [editing, setEditing] = useState<{ id: string; email: string; phone: string; via: string } | null>(null);
  const saveEdit = async () => {
    if (!editing) return;
    const res = await fetch("/api/subscribers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editing.id, email: editing.email.trim(), phone: editing.phone.trim(), via: editing.via }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || "Couldn't save");
    setEditing(null);
    load();
  };

  const removeAll = async () => {
    if (!confirm(`Remove all ${subscribers.length} people from Drop Alerts? (Their customer records stay.)`)) return;
    const res = await fetch("/api/subscribers?all=1", { method: "DELETE" });
    if (res.ok) load();
    else alert("Couldn't clear the list");
  };

  const exportCsv = () => {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [
      "Name,Email,Phone,Signed Up",
      ...subscribers.map((s) => [s.name ?? "", s.email ?? "", s.phone ?? "", s.createdAt.slice(0, 10)].map(esc).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `drop-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Drop Alerts</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Everyone who signed up on the home page, the Porch Pickup page or at checkout (or you added). They all get
            drop alerts and Porch Pickup notices, the way they chose (text, email or both).
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={subscribers.length === 0}
          className="bg-white hover:bg-stone-50 disabled:opacity-50 text-stone-700 border border-stone-300 font-semibold text-sm px-4 py-2 rounded-lg"
        >
          Export CSV
        </button>
      </div>

      {reminder && (
        <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-stone-900">⏰ &quot;Last call&quot; reminder</h2>
          <label className="flex flex-wrap items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={reminder.enabled}
              onChange={(e) => saveReminder({ ...reminder, enabled: e.target.checked })}
              className="h-4 w-4 accent-amber-600"
            />
            Send it automatically
            <input
              type="number"
              min={1}
              max={72}
              value={reminder.hours}
              onChange={(e) => setReminder({ ...reminder, hours: Number(e.target.value) })}
              onBlur={() => saveReminder(reminder)}
              className="w-16 text-sm px-2 py-1 border border-stone-200 rounded-lg"
            />
            hours before orders close
            {reminderMsg && <span className="text-xs text-stone-400">{reminderMsg}</span>}
          </label>
          <p className="text-[11px] text-stone-500">
            Once per drop, to people on this list who haven&apos;t ordered from that drop yet: a text if they gave a phone
            number, otherwise an email. You can also send it any time from the drop in Admin → Drops. Texts go out one by one
            at the pace set in the SMS Gate app, so leave enough time; any not sent by closing time are dropped.
          </p>
        </div>
      )}

      <form onSubmit={add} className="bg-white rounded-xl border border-stone-200 p-4 flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[180px]">
          <span className="block text-xs font-medium text-stone-600 mb-1">Email</span>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg"
          />
        </label>
        <label className="flex-1 min-w-[150px]">
          <span className="block text-xs font-medium text-stone-600 mb-1">Phone (for texts)</span>
          <input
            type="tel"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="(555) 000-0000"
            className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg"
          />
        </label>
        <button
          disabled={adding || (!newEmail.trim() && !newPhone.trim())}
          className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2 rounded-lg"
        >
          {adding ? "Adding…" : "+ Add to list"}
        </button>
        <p className="basis-full text-[11px] text-stone-400">
          Only add people who asked for drop alerts. Anyone who replied STOP never gets texts.
        </p>
      </form>

      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-5 h-5 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
        </div>
      ) : subscribers.length === 0 ? (
        <div className="bg-white rounded-xl p-10 border border-stone-200 text-center">
          <p className="text-stone-500 font-medium">No sign-ups yet</p>
          <p className="text-xs text-stone-400 mt-1">The &quot;Never miss a drop&quot; form is at the bottom of your home page.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 overflow-x-auto">
          <div className="px-4 py-3 text-sm text-stone-600 border-b border-stone-100 flex flex-wrap items-center justify-between gap-2">
            <span>
              <b className="text-stone-900">{subscribers.length}</b> {subscribers.length === 1 ? "person" : "people"} on the
              list · {subscribers.filter((s) => /mail/i.test(getsLabel(s))).length} get emails,{" "}
              {subscribers.filter((s) => /text/i.test(getsLabel(s))).length} get texts
            </span>
            <button onClick={removeAll} className="text-xs text-stone-400 hover:text-red-600">
              Remove all
            </button>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-stone-100">
              {subscribers.map((s) =>
                editing?.id === s.id ? (
                  <tr key={s.id} className="bg-amber-50/50">
                    <td className="px-4 py-3 text-stone-900 font-medium">{s.name ?? "—"}</td>
                    <td className="px-4 py-2">
                      <input
                        type="email"
                        value={editing.email}
                        onChange={(e) =>
                          // No email left: they can only get texts
                          setEditing({ ...editing, email: e.target.value, via: e.target.value.trim() ? editing.via : "text" })
                        }
                        placeholder="No email"
                        className="w-full min-w-[160px] text-sm px-2 py-1 border border-stone-200 rounded-lg"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="tel"
                        value={editing.phone}
                        onChange={(e) =>
                          // No phone left: they can only get emails
                          setEditing({ ...editing, phone: e.target.value, via: e.target.value.trim() ? editing.via : "email" })
                        }
                        placeholder="No phone"
                        className="w-full min-w-[120px] text-sm px-2 py-1 border border-stone-200 rounded-lg"
                      />
                    </td>
                    <td colSpan={2} className="px-4 py-2 text-[11px] text-stone-500">
                      <label className="flex items-center gap-1.5 mb-1">
                        Gets
                        <select
                          value={editing.via}
                          onChange={(e) => setEditing({ ...editing, via: e.target.value })}
                          className="text-xs px-1.5 py-1 border border-stone-200 rounded-lg"
                        >
                          <option value="text">Texts only</option>
                          <option value="email">Emails only</option>
                          <option value="both">Texts + emails</option>
                        </select>
                      </label>
                      Clear a box to remove that email or phone.
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={saveEdit} className="text-xs font-semibold text-amber-700 hover:underline mr-3">
                        Save
                      </button>
                      <button onClick={() => setEditing(null)} className="text-xs text-stone-400 hover:text-stone-700">
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
                <tr key={s.id}>
                  <td className="px-4 py-3 text-stone-900 font-medium">{s.name ?? <span className="text-stone-300 font-normal">—</span>}</td>
                  <td className="px-4 py-3 text-stone-700">{s.email ?? <span className="text-stone-400">text only</span>}</td>
                  <td className="px-4 py-3 text-stone-600 whitespace-nowrap">{s.phone || "—"}</td>
                  <td className="px-4 py-3 text-stone-500 whitespace-nowrap text-xs">
                    {s.stopped ? (
                      <span className="text-red-600" title="They replied STOP. Texts start again if they reply START.">
                        Replied STOP{s.email ? " (email only)" : ""}
                      </span>
                    ) : (
                      getsLabel(s)
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-500 whitespace-nowrap">{shortDate(s.createdAt)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() =>
                        setEditing({
                          id: s.id,
                          email: s.email ?? "",
                          phone: s.phone ?? "",
                          via: s.dropVia ?? (s.email && s.phone ? "both" : s.email ? "email" : "text"),
                        })
                      }
                      className="text-xs text-stone-500 hover:text-stone-900 mr-3"
                    >
                      Edit
                    </button>
                    <button onClick={() => remove(s)} className="text-xs text-stone-400 hover:text-red-600">
                      Remove
                    </button>
                  </td>
                </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
