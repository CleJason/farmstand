"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { useSite } from "@/components/SiteProvider";
import {
  BAKE_STATUSES,
  bakeList,
  cancelsAt,
  itemName,
  pickupAt,
  pickupDay,
  remindToPay,
  setOrderStatus,
  statusConfig,
  type Order,
} from "@/components/admin/orders-shared";

type Thread = { phone: string; name: string | null; last: { body: string; createdAt: string; direction: string }; unread: number };
type DropRow = {
  id: string;
  title: string;
  status: string;
  orderOpenAt: string;
  orderCloseAt: string;
  dropProducts: { id: string; quantityLimit: number | null; quantitySold: number; product: { name: string } }[];
};

const PICKUP_STATUSES = ["AWAITING_CONFIRM", "PAID", "READY", "PICKED_UP"];
const DAY = 86_400_000;

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase();
const ago = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
};
const who = (o: Order) => o.guestName || o.user?.name || o.guestEmail || o.user?.email || "Guest";
const short = (name: string) => {
  const [first, last] = name.trim().split(/\s+/);
  return last ? `${first} ${last[0]}.` : first;
};
const itemsLine = (o: Order) => o.items.map((i) => `${i.quantity} ${itemName(i)}`).join(", ");

/**
 * The owner's day at a glance: who's picking up today, what needs her (payments
 * to confirm, texts, low stock), revenue lately and what to bake next.
 */
export default function AdminTodayPage() {
  const site = useSite();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [drops, setDrops] = useState<DropRow[]>([]);
  const [unpaidHours, setUnpaidHours] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/orders")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setOrders(Array.isArray(d) ? d : []))
      .catch(() => setOrders([]));
    fetch("/api/messages")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setThreads(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    fetch("/api/drops")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setDrops(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch("/api/settings/unpaid")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setUnpaidHours(Number(d.hours) || 0))
      .catch(() => {});
    // Keep it fresh while it's left open on the counter
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const change = async (o: Order, status: string) => {
    if (await setOrderStatus(o.id, status)) load();
  };

  if (!orders) return <p className="text-sm text-stone-400">Loading…</p>;

  const now = new Date();
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const onDay = (o: Order, start: number) => {
    const at = pickupAt(o);
    const t = at ? new Date(at).getTime() : NaN;
    return t >= start && t < start + DAY;
  };

  // Today's pickups, in time order
  const pickups = orders
    .filter((o) => o.type === "DROP" && PICKUP_STATUSES.includes(o.status) && onDay(o, startOfToday))
    .sort((a, b) => String(pickupAt(a)).localeCompare(String(pickupAt(b))));
  const ready = pickups.filter((o) => o.status === "READY").length;
  const toPack = pickups.filter((o) => o.status === "PAID").length;
  const toMarkReady = pickups.filter((o) => o.status === "PAID");

  const awaiting = orders
    .filter((o) => o.status === "AWAITING_CONFIRM")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const unread = threads.filter((t) => t.unread > 0);
  const unreadCount = unread.reduce((n, t) => n + t.unread, 0);
  const oldestUnread = unread.map((t) => t.last.createdAt).sort()[0];

  // Revenue by the day it was ordered, last 7 days and the 7 before
  const paid = orders.filter((o) => BAKE_STATUSES.includes(o.status));
  const days = Array.from({ length: 7 }, (_, i) => startOfToday - (6 - i) * DAY);
  const perDay = days.map((d) => paid.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return t >= d && t < d + DAY;
  }).reduce((s, o) => s + o.total, 0));
  const week = perDay.reduce((a, b) => a + b, 0);
  const lastWeek = paid
    .filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= days[0] - 7 * DAY && t < days[0];
    })
    .reduce((s, o) => s + o.total, 0);
  const trend = lastWeek ? Math.round(((week - lastWeek) / lastWeek) * 100) : null;
  const maxDay = Math.max(...perDay, 1);

  // Open drops running low (the same "almost gone" point as the shop, or 3)
  const lowAt = Number(site.SITE_LOW_STOCK_AT) || 3;
  const low = drops
    .filter((d) => d.status !== "DRAFT" && new Date(d.orderOpenAt) <= now && new Date(d.orderCloseAt) > now)
    .flatMap((d) =>
      d.dropProducts
        .filter((dp) => dp.quantityLimit !== null && dp.quantityLimit - dp.quantitySold <= lowAt)
        .map((dp) => ({ drop: d, name: dp.product.name, left: Math.max(0, dp.quantityLimit! - dp.quantitySold) }))
    );

  // What to bake next: the first pickup day after today with paid orders
  const upcoming = orders.filter((o) => o.type === "DROP" && BAKE_STATUSES.includes(o.status) && (() => {
    const at = pickupAt(o);
    return !!at && new Date(at).getTime() >= startOfToday + DAY;
  })());
  const nextDay = upcoming.map(pickupAt).sort()[0];
  const nextDayStart = nextDay ? new Date(nextDay).setHours(0, 0, 0, 0) : null;
  const nextOrders = nextDayStart ? upcoming.filter((o) => onDay(o, nextDayStart)) : [];
  const toBake = bakeList(nextOrders);
  const nextUnpaid = nextDayStart
    ? orders.filter((o) => o.type === "DROP" && o.status === "AWAITING_CONFIRM" && onDay(o, nextDayStart)).length
    : 0;

  const markAllReady = async () => {
    if (!confirm(`Mark ${toMarkReady.length} order${toMarkReady.length === 1 ? "" : "s"} ready? Each customer gets a "ready for pickup" message.`)) return;
    setBusy(true);
    for (const o of toMarkReady) await setOrderStatus(o.id, "READY");
    setBusy(false);
    load();
  };

  const first = pickups[0] && pickupAt(pickups[0]);
  const last = pickups.length && pickupAt(pickups[pickups.length - 1]);
  const attention = awaiting.length + unread.length + low.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Today</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            {pickups.length
              ? ` · ${pickups.length} pickup${pickups.length === 1 ? "" : "s"}${first && last ? ` between ${time(first)} and ${time(last)}` : ""}`
              : " · no pickups today"}
          </p>
        </div>
        <Link href="/admin/drops" className="print:hidden bg-stone-900 hover:bg-stone-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          New drop
        </Link>
      </div>

      {/* At a glance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
        <Stat label="Pickups today" value={String(pickups.length)} note={pickups.length ? `${ready} ready, ${toPack} to pack` : "None"} />
        <Stat label="Payments to confirm" value={String(awaiting.length)} note="Venmo and PayPal" tone={awaiting.length ? "amber" : undefined} href="/admin" />
        <Stat
          label="Unread texts"
          value={String(unreadCount)}
          note={oldestUnread ? `Oldest ${ago(oldestUnread)}` : "All caught up"}
          tone={unreadCount ? "amber" : undefined}
          href="/admin/messages"
        />
        <Stat
          label="Revenue, last 7 days"
          value={formatPrice(week)}
          note={trend === null ? "" : `${trend >= 0 ? "Up" : "Down"} ${Math.abs(trend)}% vs the week before`}
          href="/admin/sales"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          {/* Today's pickups */}
          <section className="bg-white rounded-xl border border-stone-200">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-stone-100">
              <h2 className="font-semibold text-stone-900">Pickups today</h2>
              {pickups.length > 0 && (
                <div className="flex gap-2 print:hidden">
                  <button onClick={() => window.print()} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700">
                    Print pickup sheet
                  </button>
                  {toMarkReady.length > 0 && (
                    <button
                      onClick={markAllReady}
                      disabled={busy}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white disabled:opacity-50"
                    >
                      {busy ? "Marking…" : "Mark all ready"}
                    </button>
                  )}
                </div>
              )}
            </div>
            {pickups.length ? (
              <ul className="divide-y divide-stone-100">
                {pickups.map((o) => {
                  const s = statusConfig[o.status] ?? { label: o.status, classes: "bg-stone-100 text-stone-600" };
                  return (
                    <li key={o.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm break-inside-avoid">
                      <span className="w-16 font-semibold text-stone-900 tabular-nums">{pickupAt(o) ? time(pickupAt(o)!) : ""}</span>
                      <span className="min-w-0 flex-1">
                        <Link href={`/admin#order-${o.id}`} className="font-medium text-stone-900 hover:underline">
                          {short(who(o))}
                        </Link>{" "}
                        <span className="text-xs text-stone-400">#{o.id.slice(-6).toUpperCase()}</span>
                        <span className="block text-stone-600">{itemsLine(o)}</span>
                        {o.notes && <span className="block text-xs text-amber-800">Note: {o.notes}</span>}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.classes}`}>
                        {o.status === "AWAITING_CONFIRM" ? `Awaiting ${o.paymentMethod === "PAYPAL" ? "PayPal" : "Venmo"}` : s.label}
                      </span>
                      <span className="print:hidden w-28 text-right">
                        {o.status === "AWAITING_CONFIRM" && <Action onClick={() => change(o, "PAID")}>Confirm paid</Action>}
                        {o.status === "PAID" && <Action onClick={() => change(o, "READY")}>Mark ready</Action>}
                        {o.status === "READY" && <Action onClick={() => change(o, "PICKED_UP")} light>Picked up</Action>}
                      </span>
                      {/* On the printed sheet: a box to tick */}
                      <span className="hidden print:inline-block w-5 h-5 border border-stone-400 rounded" />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-stone-400">No pickups today.</p>
            )}
          </section>

          {/* Revenue chart */}
          <section className="bg-white rounded-xl border border-stone-200 p-4 print:hidden">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-stone-900">Revenue, last 7 days</h2>
              <Link href="/admin/sales" className="text-xs font-medium text-amber-700 hover:underline">
                Open Sales
              </Link>
            </div>
            <div className="flex items-end gap-2 h-32">
              {perDay.map((cents, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={formatPrice(cents)}>
                  <span className="text-[10px] text-stone-500 tabular-nums">{cents ? `$${Math.round(cents / 100)}` : ""}</span>
                  <div
                    className={`w-full rounded-t ${i === 6 ? "bg-amber-600" : "bg-amber-200"}`}
                    style={{ height: `${Math.max(2, (cents / maxDay) * 100)}%` }}
                  />
                  <span className="text-[11px] text-stone-500">
                    {i === 6 ? "Today" : new Date(days[i]).toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6 print:hidden">
          {/* Needs attention */}
          <section className="bg-white rounded-xl border border-stone-200">
            <h2 className="font-semibold text-stone-900 px-4 py-3 border-b border-stone-100">Needs attention</h2>
            {attention ? (
              <ul className="divide-y divide-stone-100 text-sm">
                {awaiting.map((o) => {
                  const at = cancelsAt(o, unpaidHours);
                  return (
                    <li key={o.id} className="px-4 py-3 flex items-start gap-3">
                      <span className="flex-1 min-w-0">
                        <Link href={`/admin#order-${o.id}`} className="font-medium text-stone-900 hover:underline">
                          {short(who(o))} · {formatPrice(o.total)} {o.paymentMethod === "PAYPAL" ? "PayPal" : "Venmo"}
                        </Link>
                        <span className="block text-xs text-stone-500">
                          Unpaid {ago(o.createdAt).replace(" ago", "")}
                          {at ? `, auto-cancels ${at.toLocaleString("en-US", { weekday: at.getTime() - now.getTime() > DAY ? "short" : undefined, hour: "numeric", minute: "2-digit" })}` : ""}
                        </span>
                      </span>
                      <Action onClick={() => remindToPay(o, site.SITE_NAME, unpaidHours)} light>
                        Remind
                      </Action>
                    </li>
                  );
                })}
                {unread.map((t) => (
                  <li key={t.phone} className="px-4 py-3 flex items-start gap-3">
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-stone-900">New text from {t.name ? short(t.name) : t.phone}</span>
                      <span className="block text-xs text-stone-500 truncate">“{t.last.body}”</span>
                    </span>
                    <Link href={`/admin/messages?phone=${t.phone}`} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700">
                      Reply
                    </Link>
                  </li>
                ))}
                {low.map((l) => (
                  <li key={`${l.drop.id}-${l.name}`} className="px-4 py-3 flex items-start gap-3">
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-stone-900">
                        {l.name}: {l.left ? `${l.left} left` : "sold out"}
                      </span>
                      <span className="block text-xs text-stone-500">{l.drop.title}</span>
                    </span>
                    <Link href="/admin/drops" className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700">
                      Add stock
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-stone-400">Nothing right now.</p>
            )}
          </section>

          {/* Bake list for the next pickup day */}
          {nextDayStart && (
            <section className="bg-white rounded-xl border border-stone-200">
              <h2 className="font-semibold text-stone-900 px-4 py-3 border-b border-stone-100">
                Bake list, {pickupDay(nextOrders[0])}
              </h2>
              <ul className="divide-y divide-stone-100 text-sm">
                {toBake.map((l) => (
                  <li key={l.name} className="px-4 py-2.5">
                    <span className="flex justify-between gap-3">
                      <span className="text-stone-800">{l.name}</span>
                      <span className="font-semibold text-stone-900 tabular-nums">{l.count}</span>
                    </span>
                    {l.extras.length > 0 && (
                      <span className="block text-xs text-stone-500 mt-0.5">
                        {l.extras.map(([name, n]) => `${name} × ${n}`).join(" · ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {nextUnpaid > 0 && (
                <p className="px-4 py-2 text-xs text-stone-500 border-t border-stone-100">
                  Not counted: {nextUnpaid} order{nextUnpaid === 1 ? "" : "s"} still waiting on payment.
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, note, tone, href }: { label: string; value: string; note: string; tone?: "amber"; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone === "amber" ? "text-amber-600" : "text-stone-900"}`}>{value}</p>
      {note && <p className="text-xs text-stone-500 mt-0.5">{note}</p>}
    </>
  );
  const cls = "block bg-white p-4 rounded-xl border border-stone-200";
  return href ? (
    <Link href={href} className={`${cls} hover:border-stone-300`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Action({ onClick, children, light }: { onClick: () => void; children: React.ReactNode; light?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap ${
        light ? "bg-stone-100 hover:bg-stone-200 text-stone-700" : "bg-stone-900 hover:bg-stone-800 text-white"
      }`}
    >
      {children}
    </button>
  );
}
