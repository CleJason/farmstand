"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { useSite } from "@/components/SiteProvider";
import type { Customer } from "@/app/api/customers/route";
import CustomerImport from "@/components/CustomerImport";

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

function toCsv(rows: Customer[]): string {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Name", "Email", "Phone", "Type", "Orders", "Total Spent", "Points", "Last Order", "Signed Up"];
  const lines = rows.map((c) =>
    [
      c.name,
      c.email,
      c.phone,
      c.kind === "account" ? "Account" : c.kind === "added" ? "Added" : "Guest",
      c.orderCount,
      (c.totalSpent / 100).toFixed(2),
      c.points,
      c.lastOrderAt?.slice(0, 10) ?? "",
      c.signedUpAt?.slice(0, 10) ?? "",
    ]
      .map(esc)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

export default function AdminCustomersPage() {
  const site = useSite();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [edit, setEdit] = useState<{ name: string; phone: string; email: string } | null>(null);
  // All reviews (admin view includes the reviewer's email) to show on each profile
  const [reviews, setReviews] = useState<{ id: string; rating: number; body: string; email: string | null; reviewDate: string }[]>([]);
  useEffect(() => {
    fetch("/api/reviews")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setReviews(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);
  const [editError, setEditError] = useState("");

  const saveEdit = async () => {
    if (!selected || !edit) return;
    setEditError("");
    const res = await fetch(`/api/customers?key=${encodeURIComponent(selected.key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: edit.name,
        phone: edit.phone,
        email: edit.email,
        contactId: selected.contactId,
        currentPhone: selected.phone,
      }),
    });
    if (!res.ok) {
      setEditError((await res.json().catch(() => ({}))).error || "Couldn't save");
      return;
    }
    // Reload so the old email/number shows under "Previously"
    setSelected(null);
    setEdit(null);
    load();
  };

  const load = () =>
    fetch("/api/customers")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCustomers(Array.isArray(data) ? data : []))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const deleteCustomer = async (c: Customer) => {
    const who = c.name || c.email || c.phone || "this customer";
    if (
      !confirm(
        `Delete ${who}?\n\nTheir account (if any) and their name, email and phone are removed. ` +
          `Their past orders stay in your sales records without contact info. This can't be undone.`
      )
    ) {
      return;
    }
    const res = await fetch(
      `/api/customers?key=${encodeURIComponent(c.key)}${c.contactId ? `&contactId=${encodeURIComponent(c.contactId)}` : ""}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Couldn't delete customer");
      return;
    }
    setSelected(null);
    load();
  };

  // Two entries for one person
  const [mergeSearch, setMergeSearch] = useState<string | null>(null);
  const mergeWith = async (other: Customer) => {
    if (!selected) return;
    if (!confirm(`Merge ${other.name || other.email || other.phone} into ${selected.name || selected.email || selected.phone}? This can't be undone from here.`)) return;
    const res = await fetch("/api/customers/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keep: selected, other }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || "Couldn't merge them");
    setMergeSearch(null);
    setSelected(null);
    load();
  };

  // Points by hand, e.g. a cash sale
  const [pointsDelta, setPointsDelta] = useState("");
  const [pointsReason, setPointsReason] = useState("");
  const reloadSelected = async (key: string) => {
    const res = await fetch("/api/customers");
    const data: Customer[] = res.ok ? await res.json() : [];
    if (!Array.isArray(data)) return;
    setCustomers(data);
    setSelected(data.find((c) => c.key === key) ?? null);
  };
  const adjustPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const res = await fetch("/api/customers/points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: selected.email, phone: selected.phone, points: Number(pointsDelta), reason: pointsReason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || "Couldn't save that");
    setPointsDelta("");
    setPointsReason("");
    await reloadSelected(selected.key);
  };
  const removeAdjustment = async (id: string) => {
    if (!selected || !confirm("Remove this points change?")) return;
    const res = await fetch(`/api/customers/points?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) return alert("Couldn't remove it");
    await reloadSelected(selected.key);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    const digits = q.replace(/\D/g, "");
    return customers.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        [c.email, ...c.previousEmails].some((e) => e?.toLowerCase().includes(q)) ||
        (digits.length >= 3 && [c.phone, ...c.previousPhones].some((p) => p?.replace(/\D/g, "").includes(digits)))
    );
  }, [customers, query]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Customers</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Everyone who has signed up or placed an order.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CustomerImport onDone={load} />
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="bg-white hover:bg-stone-50 disabled:opacity-50 text-stone-700 border border-stone-300 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name, email or phone"
        className="w-full max-w-sm border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
      />

      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-5 h-5 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-10 border border-stone-200 text-center">
          <p className="text-stone-500 font-medium">
            {customers.length === 0 ? "No customers yet" : "No customers match your search"}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-stone-500 uppercase tracking-wider border-b border-stone-200">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Customer</th>
                <th className="text-left font-semibold px-4 py-3">Phone</th>
                <th className="text-right font-semibold px-4 py-3">Orders</th>
                <th className="text-right font-semibold px-4 py-3">Spent</th>
                <th className="text-right font-semibold px-4 py-3">Points</th>
                <th className="text-right font-semibold px-4 py-3">Last order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map((c) => (
                <tr
                  key={c.key}
                  onClick={() => {
                    setSelected(c);
                    setEdit(null);
                  }}
                  className="hover:bg-stone-50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-stone-900">{c.name || c.email || "Guest"}</div>
                    {c.name && c.email && <div className="text-xs text-stone-500">{c.email}</div>}
                    {c.kind !== "account" && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                        {c.kind === "added" ? "Added by you" : "Guest"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-600 whitespace-nowrap">{c.phone || "—"}</td>
                  <td className="px-4 py-3 text-right text-stone-900">{c.orderCount}</td>
                  <td className="px-4 py-3 text-right text-stone-900">{formatPrice(c.totalSpent)}</td>
                  <td className="px-4 py-3 text-right text-stone-900">{c.points}</td>
                  <td className="px-4 py-3 text-right text-stone-600 whitespace-nowrap">
                    {shortDate(c.lastOrderAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {edit ? (
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-stone-900">Edit customer</h2>
                <input
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  placeholder="Name"
                  className="w-full text-sm px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  type="tel"
                  value={edit.phone}
                  onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                  placeholder="Phone"
                  className="w-full text-sm px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  type="email"
                  value={edit.email}
                  onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                  placeholder="Email"
                  className="w-full text-sm px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-xs text-stone-500">
                  Changing the email or phone keeps the old one on their profile, so their past and future orders stay
                  together.{selected.kind === "account" && " They'll sign in with the new email from now on."}
                </p>
                {editError && <p className="text-sm text-red-600">{editError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setEdit(null)} className="flex-1 border border-stone-300 text-stone-700 font-semibold text-sm py-2 rounded-lg">
                    Cancel
                  </button>
                  <button onClick={saveEdit} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm py-2 rounded-lg">
                    Save
                  </button>
                </div>
              </div>
            ) : (
            <div>
              <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-stone-900">
                {selected.name || selected.email || selected.phone || "Guest"}
              </h2>
              <span className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => setMergeSearch(mergeSearch === null ? "" : null)}
                  className="text-xs font-medium px-2.5 py-1 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700"
                >
                  Merge
                </button>
                <button
                  onClick={() => {
                    setEditError("");
                    setEdit({ name: selected.name ?? "", phone: selected.phone ?? "", email: selected.email ?? "" });
                  }}
                  className="text-xs font-medium px-2.5 py-1 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700"
                >
                  Edit
                </button>
              </span>
              </div>
              {mergeSearch !== null && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                  <p className="text-xs text-stone-600">
                    Find their other entry. It joins this one: this customer&apos;s details stay, and the other&apos;s email and
                    phone go on the profile, so all their orders and points add up.
                  </p>
                  <input
                    autoFocus
                    value={mergeSearch}
                    onChange={(e) => setMergeSearch(e.target.value)}
                    placeholder="Search name, email or phone"
                    aria-label="Search for the other customer"
                    className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg bg-white"
                  />
                  {mergeSearch.trim().length >= 2 &&
                    customers
                      .filter(
                        (c) =>
                          c.key !== selected.key &&
                          [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(mergeSearch.trim().toLowerCase()))
                      )
                      .slice(0, 6)
                      .map((c) => (
                        <button
                          key={c.key}
                          onClick={() => mergeWith(c)}
                          className="w-full text-left text-xs px-3 py-2 rounded-lg bg-white border border-stone-200 hover:border-amber-400"
                        >
                          <b>{c.name || "No name"}</b> {[c.email, c.phone].filter(Boolean).join(" · ")} · {c.orderCount} orders
                        </button>
                      ))}
                </div>
              )}
              <div className="text-sm text-stone-500 mt-1 space-y-0.5">
                {selected.email && <div>{selected.email}</div>}
                {selected.phone && <div>{selected.phone}</div>}
                {selected.imported && (
                  <div className="text-xs text-stone-600">
                    Imported history: {selected.imported.orders} {selected.imported.orders === 1 ? "order" : "orders"} ·{" "}
                    {formatPrice(selected.imported.spent)}
                    {selected.imported.lastOrderAt && ` · last ${shortDate(selected.imported.lastOrderAt)}`}
                  </div>
                )}
                {selected.note && <div className="text-xs text-stone-600 italic">Note: {selected.note}</div>}
                {(selected.previousEmails.length > 0 || selected.previousPhones.length > 0) && (
                  <div className="text-xs text-stone-400">
                    Previously: {[...selected.previousEmails, ...selected.previousPhones].join(", ")}
                  </div>
                )}
                <div>
                  {selected.kind === "account"
                    ? `Account since ${shortDate(selected.signedUpAt)}`
                    : selected.kind === "added"
                    ? `Added ${shortDate(selected.signedUpAt)}`
                    : "Guest checkout"}
                </div>
              </div>
              {(selected.email || selected.phone) && (
                <button
                  onClick={async () => {
                    const who = selected.name || selected.email || selected.phone;
                    if (!confirm(`Send ${who} a link to leave a review?`)) return;
                    const res = await fetch("/api/customers/review-request", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: selected.name, email: selected.email, phone: selected.phone }),
                    });
                    const data = await res.json().catch(() => ({}));
                    alert(res.ok ? `Sent by ${data.via === "both" ? "email and text" : data.via}.` : data.error || "Couldn't send it");
                  }}
                  className="mt-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800"
                >
                  ⭐ Ask for a review
                </button>
              )}
            </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-stone-50 rounded-lg p-3">
                <div className="text-xs text-stone-500">Orders</div>
                <div className="text-lg font-bold text-stone-900">{selected.orderCount}</div>
              </div>
              <div className="bg-stone-50 rounded-lg p-3">
                <div className="text-xs text-stone-500">Total spent</div>
                <div className="text-lg font-bold text-stone-900">{formatPrice(selected.totalSpent)}</div>
              </div>
              <div className="col-span-2 bg-amber-50 rounded-lg p-3">
                <div className="text-xs text-stone-500">Loyalty points (only you can see these)</div>
                <div className="text-lg font-bold text-stone-900">{selected.points}</div>
                <div className="text-[11px] text-stone-500">
                  1 point per $1 paid on {formatPrice(selected.pointsSpent)}
                  {selected.imported?.spent ? `, including ${formatPrice(selected.imported.spent)} of imported history` : ""}
                  {selected.pointAdjustments.length > 0 ? ", plus the changes below" : ""}
                </div>
                {selected.pointAdjustments.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-stone-700">
                    {selected.pointAdjustments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2">
                        <span>
                          <b>{a.points > 0 ? `+${a.points}` : a.points}</b> {a.reason}{" "}
                          <span className="text-stone-400">{shortDate(a.createdAt)}</span>
                        </span>
                        <button onClick={() => removeAdjustment(a.id)} className="text-stone-400 hover:text-red-600">
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <form onSubmit={adjustPoints} className="mt-2 flex flex-wrap gap-1.5">
                  <input
                    type="number"
                    step="1"
                    value={pointsDelta}
                    onChange={(e) => setPointsDelta(e.target.value)}
                    placeholder="+/- points"
                    aria-label="Points to add, or negative to take off"
                    className="w-24 text-xs px-2 py-1.5 border border-stone-200 rounded-lg bg-white"
                  />
                  <input
                    value={pointsReason}
                    onChange={(e) => setPointsReason(e.target.value)}
                    placeholder='Reason, e.g. "cash sale $20"'
                    aria-label="Reason"
                    className="flex-1 min-w-[140px] text-xs px-2 py-1.5 border border-stone-200 rounded-lg bg-white"
                  />
                  <button
                    disabled={!pointsDelta || !pointsReason.trim()}
                    className="text-xs font-semibold px-3 py-1.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white rounded-lg"
                  >
                    Save
                  </button>
                </form>
              </div>
            </div>

            {(() => {
              const mine = new Set([selected.email, ...selected.previousEmails].filter(Boolean).map((e) => e!.toLowerCase()));
              const theirs = reviews.filter((r) => r.email && mine.has(r.email));
              return theirs.length === 0 ? null : (
                <div>
                  <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Reviews</h3>
                  <ul className="space-y-2">
                    {theirs.map((r) => (
                      <li key={r.id} className="text-sm bg-stone-50 rounded-lg p-2">
                        <span className="text-amber-500">{"★".repeat(r.rating)}</span>{" "}
                        <span className="text-xs text-stone-400">{shortDate(r.reviewDate)}</span>
                        <p className="text-stone-700 line-clamp-3">{r.body}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            <div>
              <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Order history</h3>
              {selected.orders.length === 0 ? (
                <p className="text-sm text-stone-500">No orders yet.</p>
              ) : (
                <ul className="divide-y divide-stone-100 border border-stone-200 rounded-lg">
                  {selected.orders.map((o) => (
                    <li key={o.id}>
                      <Link
                        href={`/admin#order-${o.id}`}
                        className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-stone-50 text-sm"
                      >
                        <span>
                          <span className="font-mono text-stone-900">#{o.id.slice(-6)}</span>{" "}
                          <span className="text-stone-500">
                            · {shortDate(o.createdAt)} · {o.type === "FARMSTAND" ? site.SITE_FARMSTAND_HEADING : o.type === "GIFT" ? "Gift card" : "Drop"}
                          </span>
                        </span>
                        <span className="text-right whitespace-nowrap">
                          <span className="font-medium text-stone-900">{formatPrice(o.total)}</span>{" "}
                          <span className="text-xs text-stone-500">{o.status.replace(/_/g, " ").toLowerCase()}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => deleteCustomer(selected)}
                className="border border-red-200 text-red-600 hover:bg-red-50 font-semibold text-sm px-4 py-2 rounded-lg"
              >
                Delete customer
              </button>
              <button
                onClick={() => setSelected(null)}
                className="flex-1 border border-stone-300 text-stone-700 font-semibold text-sm px-4 py-2 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
