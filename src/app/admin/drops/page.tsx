"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate, formatPrice } from "@/lib/utils";
import { countsStock } from "@/lib/stock";
import { useSite } from "@/components/SiteProvider";
import type { BoxPick } from "@/lib/box";
import { productAddOns } from "@/lib/addons";

interface PickupSlot {
  id: string;
  label: string;
  pickupDate: string;
  endDate: string | null;
  location: string | null;
  address: string | null;
  intervalMinutes: number;
  maxPerTime: number | null;
}

interface Drop {
  id: string;
  title: string;
  description: string | null;
  orderOpenAt: string;
  orderCloseAt: string;
  status: string;
  maxOrders: number | null;
  announcedAt: string | null;
  pickupSlots: PickupSlot[];
  dropProducts: {
    id: string;
    productId: string;
    quantityLimit: number | null;
    quantitySold: number;
    priceOverride: number | null;
    boxOptions: string[];
    product: { name: string; price: number; boxOptions: string[] };
  }[];
  orders: {
    id: string;
    total: number;
    status: string;
    items?: { dropProductId: string | null; quantity: number; selections: unknown; addOns?: unknown }[];
  }[];
}

/** For each box (choices) or product with add-ons in the drop: how many of each to make. */
/** Where a drop stands, in words: drafts are hidden; published ones open and close on their times. */
function dropLabel(drop: Drop) {
  const now = new Date();
  if (drop.status === "DRAFT") return "Draft (hidden from customers)";
  if (drop.status === "CLOSED" || new Date(drop.orderCloseAt) < now) return "Closed";
  if (new Date(drop.orderOpenAt) > now) return `Scheduled: opens ${formatDate(drop.orderOpenAt)}`;
  return "Ordering Open";
}

function boxTally(drop: Drop) {
  const tally = new Map<string, Map<string, number>>();
  const add = (dpId: string, label: string, n: number) => {
    const counts = tally.get(dpId) ?? new Map<string, number>();
    counts.set(label, (counts.get(label) ?? 0) + n);
    tally.set(dpId, counts);
  };
  for (const order of drop.orders ?? []) {
    if (!countsStock(order.status)) continue;
    for (const item of order.items ?? []) {
      if (!item.dropProductId) continue;
      if (Array.isArray(item.selections)) {
        for (const pick of item.selections as BoxPick[]) add(item.dropProductId, pick.name, pick.quantity * item.quantity);
      }
      for (const a of productAddOns(item.addOns)) add(item.dropProductId, `+ ${a.name}`, item.quantity);
    }
  }
  return drop.dropProducts
    .filter((dp) => tally.has(dp.id))
    .map((dp) => ({
      name: dp.product.name,
      picks: [...tally.get(dp.id)!].sort((a, b) => b[1] - a[1]),
    }));
}

interface Product {
  id: string;
  name: string;
  price: number;
  active: boolean;
  boxSize: number | null;
  boxOptions: string[];
}

// Form state for one pickup window (all values as typed in local time)
type WindowForm = {
  id?: string;
  date: string; // yyyy-mm-dd
  start: string; // HH:MM
  end: string; // HH:MM
  location: string; // public area
  address: string; // private, sent after payment
  interval: string;
  maxPerTime: string;
};

// boxOff: mix & match choices NOT offered this drop
type ProductForm = { included: boolean; limit: string; price: string; boxOff: string[] };
const emptyProductForm: ProductForm = { included: false, limit: "", price: "", boxOff: [] };

const pad = (n: number) => String(n).padStart(2, "0");
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toDateTimeInput = (iso: string) => {
  const d = new Date(iso);
  return `${toDateInput(d)}T${toTimeInput(d)}`;
};
const at = (date: string, time: string) => new Date(`${date}T${time}`);
const timeLabel = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function windowLabel(w: WindowForm) {
  const start = at(w.date, w.start);
  const day = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return w.end && w.end !== w.start ? `${day} · ${timeLabel(start)}–${timeLabel(at(w.date, w.end))}` : `${day} · ${timeLabel(start)}`;
}

function timesInWindow(w: WindowForm) {
  if (!w.date || !w.start) return 0;
  if (!w.end || w.end === w.start) return 1;
  const span = at(w.date, w.end).getTime() - at(w.date, w.start).getTime();
  const step = Math.max(5, Number(w.interval) || 30) * 60_000;
  return span < 0 ? 0 : Math.floor(span / step) + 1;
}

// New windows start with the pickup area from Admin → Site
const emptyWindow = (area = ""): WindowForm => ({
  date: "",
  start: "16:00",
  end: "18:00",
  location: area,
  address: "",
  interval: "30",
  maxPerTime: "",
});

const inputClass =
  "w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500";

export default function AdminDropsPage() {
  const site = useSite();
  const [drops, setDrops] = useState<Drop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [orderOpenAt, setOrderOpenAt] = useState("");
  const [orderCloseAt, setOrderCloseAt] = useState("");
  const [maxOrders, setMaxOrders] = useState("");
  const [windows, setWindows] = useState<WindowForm[]>([emptyWindow()]);
  const [productForm, setProductForm] = useState<Record<string, ProductForm>>({});

  const loadData = async () => {
    try {
      const [dropsRes, prodRes] = await Promise.all([fetch("/api/drops"), fetch("/api/products")]);
      const dropsData = await dropsRes.json();
      const prodData = await prodRes.json();
      setDrops(Array.isArray(dropsData) ? dropsData : []);
      setProducts(Array.isArray(prodData) ? prodData : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openNew = () => {
    setEditingId(null);
    setTitle("This Week's Drop");
    setDescription("");
    setOrderOpenAt("");
    setOrderCloseAt("");
    setMaxOrders("");
    setWindows([emptyWindow(site.SITE_PICKUP_AREA)]);
    setProductForm({});
    setShowModal(true);
  };

  const openEdit = (drop: Drop) => {
    setEditingId(drop.id);
    setTitle(drop.title);
    setDescription(drop.description ?? "");
    setOrderOpenAt(toDateTimeInput(drop.orderOpenAt));
    setOrderCloseAt(toDateTimeInput(drop.orderCloseAt));
    setMaxOrders(drop.maxOrders ? String(drop.maxOrders) : "");
    setWindows(
      drop.pickupSlots.map((s) => {
        const start = new Date(s.pickupDate);
        return {
          id: s.id,
          date: toDateInput(start),
          start: toTimeInput(start),
          end: s.endDate ? toTimeInput(new Date(s.endDate)) : toTimeInput(start),
          location: s.location ?? "",
          address: s.address ?? "",
          interval: String(s.intervalMinutes || 30),
          maxPerTime: s.maxPerTime ? String(s.maxPerTime) : "",
        };
      })
    );
    setProductForm(
      Object.fromEntries(
        drop.dropProducts.map((dp) => [
          dp.productId,
          {
            included: true,
            limit: dp.quantityLimit !== null ? String(dp.quantityLimit) : "",
            price: dp.priceOverride !== null ? (dp.priceOverride / 100).toFixed(2) : "",
            boxOff: dp.boxOptions?.length
              ? dp.product.boxOptions.filter((o) => !dp.boxOptions.includes(o))
              : [],
          },
        ])
      )
    );
    setShowModal(true);
  };

  const setWindow = (idx: number, patch: Partial<WindowForm>) =>
    setWindows((ws) => ws.map((w, i) => (i === idx ? { ...w, ...patch } : w)));

  const setProduct = (productId: string, patch: Partial<ProductForm>) =>
    setProductForm((pf) => ({
      ...pf,
      [productId]: { ...(pf[productId] ?? emptyProductForm), ...patch },
    }));

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Which button: "draft" saves without showing customers, "publish" puts it live
    const action = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
    const editing = drops.find((d) => d.id === editingId);
    const status = action === "draft" ? "DRAFT" : action === "publish" ? "OPEN" : editing?.status;
    const pickupSlots = windows
      .filter((w) => w.date && w.start)
      .map((w) => {
        const end = w.end && w.end !== w.start ? at(w.date, w.end) : null;
        return {
          id: w.id,
          label: windowLabel(w),
          pickupDate: at(w.date, w.start).toISOString(),
          endDate: end ? end.toISOString() : null,
          location: w.location,
          address: w.address,
          intervalMinutes: Number(w.interval) || 30,
          maxPerTime: w.maxPerTime ? Number(w.maxPerTime) : null,
        };
      });
    const dropProducts = Object.entries(productForm)
      .filter(([, p]) => p.included)
      .map(([productId, p]) => {
        const all = products.find((x) => x.id === productId)?.boxOptions ?? [];
        const on = all.filter((o) => !p.boxOff.includes(o));
        return {
          productId,
          quantityLimit: p.limit === "" ? null : Number(p.limit),
          priceOverride: p.price === "" ? null : Math.round(Number(p.price) * 100),
          // Only store a list when some choices are switched off
          boxOptions: on.length < all.length ? on : [],
          noChoices: all.length > 0 && on.length === 0,
        };
      });

    if (pickupSlots.length === 0) return alert("Add at least one pickup day and time.");
    if (dropProducts.length === 0) return alert("Choose at least one product for this drop.");
    if (dropProducts.some((p) => p.noChoices)) return alert("A mix & match box needs at least one choice turned on.");

    setSaving(true);
    try {
      const res = await fetch(editingId ? `/api/drops/${editingId}` : "/api/drops", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          orderOpenAt: new Date(orderOpenAt).toISOString(),
          orderCloseAt: new Date(orderCloseAt).toISOString(),
          maxOrders: maxOrders || null,
          ...(status ? { status } : {}),
          pickupSlots,
          products: dropProducts,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save drop");
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save drop");
    } finally {
      setSaving(false);
    }
  };

  const updateDropStatus = async (id: string, status: string) => {
    try {
      await fetch(`/api/drops/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      loadData();
    } catch {
      alert("Failed to update status");
    }
  };

  const deleteDrop = async (drop: Drop) => {
    if (!confirm(`Delete "${drop.title}"? This can't be undone.`)) return;
    const res = await fetch(`/api/drops/${drop.id}`, { method: "DELETE" });
    if (res.ok) loadData();
    else alert((await res.json().catch(() => ({}))).error || "Couldn't delete the drop");
  };

  // Products shown in the form: active ones plus any already in the drop being edited
  const formProducts = products.filter((p) => p.active || productForm[p.id]?.included);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Drops</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Pre-order windows with pickup days and times.
          </p>
        </div>
        <button
          onClick={openNew}
          className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <span className="text-base leading-none">+</span>
          New Drop
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-5 h-5 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
        </div>
      ) : drops.length === 0 ? (
        <div className="bg-white rounded-xl p-10 border border-stone-200 text-center">
          <p className="text-stone-500 font-medium">No drops yet</p>
          <p className="text-xs text-stone-400 mt-1">Create your first drop to start taking pre-orders.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {drops.map((drop) => {
            const totalOrders = drop.orders?.length || 0;
            return (
              <div key={drop.id} className="bg-white rounded-xl p-5 border border-stone-200 flex flex-col gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        drop.status === "OPEN"
                          ? "bg-emerald-50 text-emerald-700"
                          : drop.status === "CLOSED"
                          ? "bg-stone-100 text-stone-600"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {dropLabel(drop)}
                    </span>
                    <span className="text-xs text-stone-500">
                      {totalOrders} {totalOrders === 1 ? "order" : "orders"}
                    </span>
                    {drop.announcedAt && (
                      <span className="text-xs text-stone-400" title="Subscribers were emailed when this drop opened">
                        · 📣 alert sent
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-stone-900">{drop.title}</h3>
                  {drop.description && <p className="text-xs text-stone-500">{drop.description}</p>}

                  <div className="bg-stone-50 p-3 rounded-lg text-xs space-y-1 text-stone-700">
                    <div>
                      <strong className="text-stone-500">Opens:</strong> {formatDate(drop.orderOpenAt)}
                    </div>
                    <div>
                      <strong className="text-stone-500">Cutoff:</strong> {formatDate(drop.orderCloseAt)}
                    </div>
                  </div>

                  {drop.pickupSlots.length > 0 && (
                    <div className="text-xs space-y-1">
                      <div className="font-semibold text-stone-900">Pickup</div>
                      {drop.pickupSlots.map((s) => (
                        <div key={s.id} className="text-stone-600">
                          {s.label}
                          {s.location && <span className="text-stone-400"> · {s.location}</span>}
                          {s.maxPerTime && <span className="text-stone-400"> · max {s.maxPerTime}/time</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-xs space-y-1">
                    <div className="font-semibold text-stone-900">Products</div>
                    <div className="flex flex-wrap gap-1.5">
                      {drop.dropProducts.map((dp) => (
                        <span key={dp.id} className="bg-stone-50 border border-stone-200 text-stone-700 px-2 py-1 rounded-md text-[11px]">
                          {dp.product.name} · {formatPrice(dp.priceOverride ?? dp.product.price)} ({dp.quantitySold}/
                          {dp.quantityLimit ?? "∞"})
                        </span>
                      ))}
                    </div>
                  </div>

                  {boxTally(drop).map((box) => (
                    <div key={box.name} className="text-xs space-y-1">
                      <div className="font-semibold text-stone-900">{box.name}: what to make</div>
                      <div className="flex flex-wrap gap-1.5">
                        {box.picks.map(([name, count]) => (
                          <span key={name} className="bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1 rounded-md text-[11px]">
                            {count} × {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-3 mt-auto border-t border-stone-100 flex items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(drop)}
                      className="text-xs font-medium px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg"
                    >
                      Edit
                    </button>
                    {drop.status === "OPEN" ? (
                      <button
                        onClick={() => confirm("Close this drop? Customers won't be able to order.") && updateDropStatus(drop.id, "CLOSED")}
                        className="text-xs font-medium px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg"
                      >
                        Close Orders
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          confirm(
                            new Date(drop.orderOpenAt) > new Date()
                              ? `Publish? Customers can see the menu now, ordering and the drop alert start ${formatDate(drop.orderOpenAt)}.`
                              : "Publish now? Ordering opens and the drop alert goes out (once) to everyone on the list."
                          ) && updateDropStatus(drop.id, "OPEN")
                        }
                        className="text-xs font-semibold px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
                      >
                        {drop.status === "DRAFT" ? "Publish" : "Reopen Orders"}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => deleteDrop(drop)} className="text-xs text-stone-400 hover:text-red-600">
                      Delete
                    </button>
                    <Link href={`/drops/${drop.id}`} className="text-xs text-amber-700 font-semibold hover:underline">
                      Customer view →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-stone-900 mb-4">{editingId ? "Edit Drop" : "New Drop"}</h2>
            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-stone-600 mb-1">Title *</span>
                  <input required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-stone-600 mb-1">Description</span>
                  <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} resize-y`} />
                </label>
                <div className="grid sm:grid-cols-3 gap-3">
                  <label className="block">
                    <span className="block text-xs font-medium text-stone-600 mb-1">Orders open *</span>
                    <input type="datetime-local" required value={orderOpenAt} onChange={(e) => setOrderOpenAt(e.target.value)} className={inputClass} />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-stone-600 mb-1">Orders close *</span>
                    <input type="datetime-local" required value={orderCloseAt} onChange={(e) => setOrderCloseAt(e.target.value)} className={inputClass} />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-stone-600 mb-1">Max orders (optional)</span>
                    <input type="number" min="1" value={maxOrders} onChange={(e) => setMaxOrders(e.target.value)} placeholder="No limit" className={inputClass} />
                  </label>
                </div>
              </div>

              {/* Pickup windows */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-900">When customers pick up</span>
                  <button
                    type="button"
                    onClick={() => setWindows((ws) => [...ws, emptyWindow(site.SITE_PICKUP_AREA)])}
                    className="text-xs font-medium text-amber-700 hover:underline"
                  >
                    + Add pickup day
                  </button>
                </div>
                <p className="text-[11px] text-stone-500">
                  Customers choose a time in each window, every interval (start and end included).
                </p>
                {windows.map((w, idx) => {
                  const count = timesInWindow(w);
                  return (
                    <div key={w.id ?? `new-${idx}`} className="border border-stone-200 rounded-xl p-3 space-y-2 bg-stone-50">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <label className="block col-span-2 sm:col-span-1">
                          <span className="block text-[11px] text-stone-500 mb-0.5">Day</span>
                          <input type="date" required value={w.date} onChange={(e) => setWindow(idx, { date: e.target.value })} className={inputClass} />
                        </label>
                        <label className="block">
                          <span className="block text-[11px] text-stone-500 mb-0.5">From</span>
                          <input type="time" required value={w.start} onChange={(e) => setWindow(idx, { start: e.target.value })} className={inputClass} />
                        </label>
                        <label className="block">
                          <span className="block text-[11px] text-stone-500 mb-0.5">To</span>
                          <input type="time" value={w.end} onChange={(e) => setWindow(idx, { end: e.target.value })} className={inputClass} />
                        </label>
                        <label className="block col-span-2 sm:col-span-1">
                          <span className="block text-[11px] text-stone-500 mb-0.5">Every</span>
                          <select value={w.interval} onChange={(e) => setWindow(idx, { interval: e.target.value })} className={inputClass}>
                            <option value="15">15 min</option>
                            <option value="30">30 min</option>
                            <option value="60">1 hour</option>
                          </select>
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="block text-[11px] text-stone-500 mb-0.5">Area (shown to everyone)</span>
                          <input value={w.location} onChange={(e) => setWindow(idx, { location: e.target.value })} placeholder="e.g. Springfield, Ohio" className={inputClass} />
                        </label>
                        <label className="block">
                          <span className="block text-[11px] text-stone-500 mb-0.5">Max pickups per time</span>
                          <input type="number" min="1" value={w.maxPerTime} onChange={(e) => setWindow(idx, { maxPerTime: e.target.value })} placeholder="No limit" className={inputClass} />
                        </label>
                      </div>
                      <label className="block">
                        <span className="block text-[11px] text-stone-500 mb-0.5">
                          Exact address (private — only sent to customers after they pay)
                        </span>
                        <input
                          value={w.address}
                          onChange={(e) => setWindow(idx, { address: e.target.value })}
                          placeholder="Leave blank to use the address in Site settings"
                          className={inputClass}
                        />
                      </label>
                      <div className="flex items-center justify-between text-[11px] text-stone-500">
                        <span>{w.date && w.start ? `${windowLabel(w)} · ${count} ${count === 1 ? "time" : "times"}` : "Pick a day"}</span>
                        {windows.length > 1 && (
                          <button type="button" onClick={() => setWindows((ws) => ws.filter((_, i) => i !== idx))} className="text-red-600 hover:underline">
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Products */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-stone-900">Products in this drop</span>
                {formProducts.length === 0 ? (
                  <p className="text-xs text-stone-500">Add products on the Products page first.</p>
                ) : (
                  formProducts.map((p) => {
                    const f = productForm[p.id] ?? emptyProductForm;
                    const isBoxProduct = !!p.boxSize && p.boxOptions?.length > 0;
                    return (
                      <div key={p.id} className={`rounded-xl border p-3 text-xs ${f.included ? "border-amber-300 bg-amber-50/40" : "border-stone-200"}`}>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={f.included}
                            onChange={(e) => setProduct(p.id, { included: e.target.checked })}
                            className="h-4 w-4 accent-amber-600"
                          />
                          <span className="font-semibold text-stone-900 flex-1">{p.name}</span>
                          <span className="text-stone-500">{formatPrice(p.price)}</span>
                        </label>
                        {f.included && (
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <label className="block">
                              <span className="block text-[11px] text-stone-500 mb-0.5">How many available</span>
                              <input type="number" min="0" value={f.limit} onChange={(e) => setProduct(p.id, { limit: e.target.value })} placeholder="No limit" className={inputClass} />
                            </label>
                            <label className="block">
                              <span className="block text-[11px] text-stone-500 mb-0.5">Price for this drop ($)</span>
                              <input type="number" min="0" step="0.01" value={f.price} onChange={(e) => setProduct(p.id, { price: e.target.value })} placeholder={(p.price / 100).toFixed(2)} className={inputClass} />
                            </label>
                          </div>
                        )}
                        {f.included && isBoxProduct && (
                          <div className="mt-2">
                            <span className="block text-[11px] text-stone-500 mb-1">
                              Box of {p.boxSize}: choices this drop (how many available counts boxes)
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {p.boxOptions.map((o) => {
                                const on = !f.boxOff.includes(o);
                                return (
                                  <button
                                    type="button"
                                    key={o}
                                    onClick={() =>
                                      setProduct(p.id, { boxOff: on ? [...f.boxOff, o] : f.boxOff.filter((x) => x !== o) })
                                    }
                                    className={`px-2 py-1 rounded-md border text-[11px] ${
                                      on
                                        ? "bg-amber-600 border-amber-600 text-white"
                                        : "bg-white border-stone-200 text-stone-400 line-through"
                                    }`}
                                  >
                                    {o}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <p className="text-[11px] text-stone-500">
                <b>Save as draft</b> keeps it hidden so you can finish it later. <b>Publish</b> shows it to customers; ordering
                and the drop alert (email and text) start at the &quot;Orders open&quot; time.
              </p>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-stone-200 py-2 rounded-lg font-medium text-sm text-stone-600 hover:bg-stone-50">
                  Cancel
                </button>
                {(!editingId || drops.find((d) => d.id === editingId)?.status === "DRAFT") && (
                  <button
                    type="submit"
                    value="draft"
                    disabled={saving}
                    className="flex-1 border border-amber-600 text-amber-700 hover:bg-amber-50 disabled:opacity-50 font-semibold py-2 rounded-lg text-sm"
                  >
                    Save as draft
                  </button>
                )}
                <button
                  type="submit"
                  value={editingId && drops.find((d) => d.id === editingId)?.status !== "DRAFT" ? "save" : "publish"}
                  disabled={saving}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
                >
                  {saving
                    ? "Saving..."
                    : editingId && drops.find((d) => d.id === editingId)?.status !== "DRAFT"
                      ? "Save Changes"
                      : orderOpenAt && new Date(orderOpenAt) > new Date()
                        ? "Publish (opens later)"
                        : "Publish now"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
