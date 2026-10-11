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
  const header = ["Name", "Email", "Phone", "Type", "Orders", "Total Spent", "Last Order", "Signed Up"];
  const lines = rows.map((c) =>
    [
      c.name,
      c.email,
      c.phone,
      c.kind === "account" ? "Account" : c.kind === "added" ? "Added" : "Guest",
      c.orderCount,
      (c.totalSpent / 100).toFixed(2),
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
              <button
                onClick={() => {
                  setEditError("");
                  setEdit({ name: selected.name ?? "", phone: selected.phone ?? "", email: selected.email ?? "" });
                }}
                className="text-xs font-medium px-2.5 py-1 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700 shrink-0"
              >
                Edit
              </button>
              </div>
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
            </div>

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
