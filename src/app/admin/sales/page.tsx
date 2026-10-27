"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SaleRow } from "@/lib/accounting";

const money = (n: number) => `$${n.toFixed(2)}`;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Quick date ranges */
function preset(name: string): [string, string] {
  const now = new Date();
  const y = now.getFullYear();
  if (name === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    return [iso(start), iso(now)];
  }
  if (name === "month") return [`${y}-${pad(now.getMonth() + 1)}-01`, iso(now)];
  if (name === "last-month") {
    const first = new Date(y, now.getMonth() - 1, 1);
    const last = new Date(y, now.getMonth(), 0);
    return [iso(first), iso(last)];
  }
  if (name === "all") return ["2020-01-01", iso(now)];
  return [`${y}-01-01`, iso(now)];
}

const inputClass = "text-sm px-2.5 py-1.5 border border-stone-200 rounded-lg bg-white";

/** Sum of a field, grouped by a key */
function groupBy(rows: SaleRow[], key: (r: SaleRow) => string) {
  const m = new Map<string, { orders: number; revenue: number }>();
  for (const r of rows) {
    const k = key(r);
    const g = m.get(k) ?? { orders: 0, revenue: 0 };
    g.orders++;
    g.revenue += r.revenue;
    m.set(k, g);
  }
  return [...m].sort((a, b) => b[1].revenue - a[1].revenue);
}

function Breakdown({ title, rows, total }: { title: string; rows: [string, { orders: number; revenue: number }][]; total: number }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">{title}</h3>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="py-1 text-stone-800">{k}</td>
              <td className="py-1 text-right text-stone-500 text-xs">{v.orders}</td>
              <td className="py-1 text-right font-medium text-stone-900 w-24">{money(v.revenue)}</td>
              <td className="py-1 text-right text-stone-400 text-xs w-12">{total ? Math.round((v.revenue / total) * 100) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Admin → Sales: what sold, for any dates, by payment type, kind of order,
 * month and product (this shop's paid orders plus sales imported from
 * Hotplate), with the list behind it and a CSV export.
 */
export default function AdminSalesPage() {
  const [[from, to], setRange] = useState<[string, string]>(preset("month"));
  const [sales, setSales] = useState<SaleRow[] | null>(null);
  const [payment, setPayment] = useState("all");
  const [type, setType] = useState("all");
  const [source, setSource] = useState("all");

  const load = useCallback(
    (f: string, t: string) =>
      fetch(`/api/sales?from=${f}&to=${t}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setSales(Array.isArray(d) ? d : []))
        .catch(() => setSales([])),
    []
  );
  useEffect(() => {
    load(from, to);
  }, [from, to, load]);

  const all = sales ?? [];
  const options = (key: (r: SaleRow) => string) => [...new Set(all.map(key))].sort();
  const rows = useMemo(
    () =>
      (sales ?? []).filter(
        (r) => (payment === "all" || r.payment === payment) && (type === "all" || r.type === type) && (source === "all" || r.source === source)
      ),
    [sales, payment, type, source]
  );

  const revenue = rows.reduce((n, r) => n + r.revenue, 0);
  const tips = rows.reduce((n, r) => n + r.tip, 0);
  const discounts = rows.reduce((n, r) => n + r.discount, 0);
  const fees = rows.reduce((n, r) => n + (r.fees ?? 0), 0);
  const products = new Map<string, { quantity: number; amount: number }>();
  for (const r of rows) {
    for (const l of r.lines) {
      const p = products.get(l.name) ?? { quantity: 0, amount: 0 };
      p.quantity += l.quantity;
      p.amount += l.amount ?? 0;
      products.set(l.name, p);
    }
  }

  const exportCsv = () => {
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ["Date", "Source", "Order #", "Type", "Payment", "Customer", "Items", "Subtotal ($)", "Discount ($)", "Paid with Gift Card ($)", "Tip ($)", "Tax ($)", "Fees ($)", "Refunded ($)", "Revenue ($)"];
    const body = rows.map((r) => [r.date, r.source, r.orderNumber, r.type, r.payment, r.customer, r.items, r.subtotal, r.discount, r.giftCardUsed, r.tip, r.tax, r.fees ?? "", r.refunded, r.revenue]);
    const csv = [head, ...body].map((r) => r.map(esc).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `sales-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Sales</h1>
          <p className="text-sm text-stone-500 mt-0.5">Paid orders from this shop, plus past sales you imported (e.g. from Hotplate).</p>
        </div>
        <button onClick={exportCsv} disabled={!rows.length} className="bg-white hover:bg-stone-50 disabled:opacity-50 text-stone-700 border border-stone-300 font-semibold text-sm px-4 py-2 rounded-lg">
          Export CSV
        </button>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-4 flex flex-wrap items-end gap-3 text-xs text-stone-600">
        <div className="flex gap-1">
          {[
            ["week", "This week"],
            ["month", "This month"],
            ["last-month", "Last month"],
            ["year", "This year"],
            ["all", "All time"],
          ].map(([k, label]) => (
            <button key={k} onClick={() => setRange(preset(k))} className="px-2.5 py-1.5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700">
              {label}
            </button>
          ))}
        </div>
        <label>
          From
          <input type="date" value={from} onChange={(e) => setRange([e.target.value, to])} className={`${inputClass} block`} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setRange([from, e.target.value])} className={`${inputClass} block`} />
        </label>
        <label>
          Payment
          <select value={payment} onChange={(e) => setPayment(e.target.value)} className={`${inputClass} block`}>
            <option value="all">All</option>
            {options((r) => r.payment).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label>
          Kind
          <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputClass} block`}>
            <option value="all">All</option>
            {options((r) => r.type).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label>
          Source
          <select value={source} onChange={(e) => setSource(e.target.value)} className={`${inputClass} block`}>
            <option value="all">All</option>
            {options((r) => r.source).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
      </div>

      {!sales ? (
        <div className="text-center py-16">
          <div className="inline-block w-5 h-5 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              ["Revenue", money(revenue)],
              ["Orders", String(rows.length)],
              ["Average order", money(rows.length ? revenue / rows.length : 0)],
              ["Tips", money(tips)],
              ["Discounts given", money(discounts)],
            ].map(([label, value]) => (
              <div key={label} className="bg-white p-4 rounded-xl border border-stone-200">
                <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wider">{label}</p>
                <p className="text-xl font-bold text-stone-900 mt-1">{value}</p>
              </div>
            ))}
          </div>
          {fees > 0 && <p className="text-xs text-stone-500">Platform/card fees in imported sales: {money(fees)} (card fees for this shop&apos;s orders are in Stripe).</p>}

          <div className="grid md:grid-cols-3 gap-3">
            <Breakdown title="By payment" rows={groupBy(rows, (r) => r.payment)} total={revenue} />
            <Breakdown title="By kind" rows={groupBy(rows, (r) => r.type)} total={revenue} />
            <Breakdown title="By month" rows={groupBy(rows, (r) => r.date.slice(0, 7)).sort((a, b) => b[0].localeCompare(a[0]))} total={revenue} />
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">By product</h3>
            <table className="w-full text-sm">
              <tbody>
                {[...products]
                  .sort((a, b) => b[1].quantity - a[1].quantity)
                  .map(([name, p]) => (
                    <tr key={name}>
                      <td className="py-1 text-stone-800">{name}</td>
                      <td className="py-1 text-right text-stone-600">{p.quantity} sold</td>
                      <td className="py-1 text-right font-medium text-stone-900 w-24">{p.amount ? money(p.amount) : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="text-[11px] text-stone-400 mt-2">Imported sales show how many sold; per-item amounts aren&apos;t in the import.</p>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-stone-500 text-left border-b border-stone-100">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Items</th>
                  <th className="px-4 py-2.5 font-medium">Payment</th>
                  <th className="px-4 py-2.5 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {[...rows].reverse().map((r) => (
                  <tr key={`${r.source}-${r.orderNumber}`}>
                    <td className="px-4 py-2 whitespace-nowrap text-stone-600">{r.date}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-stone-600">
                      {r.orderNumber} <span className="text-[11px] text-stone-400">{r.type}{r.source !== "Shop" ? ` · ${r.source}` : ""}</span>
                    </td>
                    <td className="px-4 py-2 text-stone-800">{r.customer}</td>
                    <td className="px-4 py-2 text-stone-600 text-xs">{r.items}</td>
                    <td className="px-4 py-2 text-stone-600">{r.payment}</td>
                    <td className="px-4 py-2 text-right font-medium">{money(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <p className="p-6 text-center text-sm text-stone-400">No sales for these dates.</p>}
          </div>
        </>
      )}
    </div>
  );
}
