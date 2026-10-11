"use client";

import { useEffect, useState } from "react";

interface Subscriber {
  id: string;
  email: string | null; // null = phone only
  phone: string | null;
  createdAt: string;
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function AdminAlertsPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);

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
    if (!confirm(`Remove ${s.email ?? s.phone} from drop alerts?`)) return;
    const res = await fetch(`/api/subscribers?id=${encodeURIComponent(s.id)}`, { method: "DELETE" });
    if (res.ok) load();
    else alert("Couldn't remove them");
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
      "Email,Phone,Signed Up",
      ...subscribers.map((s) => [s.email ?? "", s.phone ?? "", s.createdAt.slice(0, 10)].map(esc).join(",")),
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
            People who signed up on the home page. They&apos;re emailed once when a drop first opens for orders.
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
              list · {subscribers.filter((s) => s.email).length} get emails,{" "}
              {subscribers.filter((s) => !s.email).length} are phone-only (texts, once texting is set up)
            </span>
            <button onClick={removeAll} className="text-xs text-stone-400 hover:text-red-600">
              Remove all
            </button>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-stone-100">
              {subscribers.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 text-stone-900">{s.email ?? <span className="text-stone-400">text only</span>}</td>
                  <td className="px-4 py-3 text-stone-600 whitespace-nowrap">{s.phone || "—"}</td>
                  <td className="px-4 py-3 text-stone-500 whitespace-nowrap">{shortDate(s.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(s)} className="text-xs text-stone-400 hover:text-red-600">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
