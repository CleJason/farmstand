"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { useSite } from "@/components/SiteProvider";
import { describePicks } from "@/lib/box";
import { describeAddOns } from "@/lib/addons";

interface Order {
  id: string;
  type: string;
  status: string;
  paymentMethod: string;
  total: number;
  discount: number;
  discountCode: string | null;
  giftCode: string | null;
  giftAmount: number;
  notes: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  manualPaymentRef: string | null;
  createdAt: string;
  pickupSlot: { label: string; location: string | null; pickupDate: string; endDate: string | null } | null;
  pickupTime: string | null;
  user: { name: string | null; email: string; phone: string | null } | null;
  drop: { title: string; orderCloseAt: string } | null;
  items: {
    id: string;
    quantity: number;
    priceAtPurchase: number;
    selections: unknown;
    addOns: unknown;
    dropProduct: { product: { name: string } } | null;
    farmstandItem: { name: string } | null;
  }[];
}

const statusConfig: Record<string, { label: string; classes: string }> = {
  PAID: { label: "Paid", classes: "bg-emerald-50 text-emerald-700" },
  AWAITING_CONFIRM: { label: "Awaiting Confirm", classes: "bg-amber-50 text-amber-700" },
  READY: { label: "Ready", classes: "bg-blue-50 text-blue-700" },
  PICKED_UP: { label: "Picked Up", classes: "bg-stone-100 text-stone-600" },
  // A card checkout that hasn't been paid (yet): the shop checks with Stripe every minute
  PENDING: { label: "Card not paid (yet)", classes: "bg-stone-100 text-stone-500" },
  CANCELLED: { label: "Cancelled", classes: "bg-red-50 text-red-600" },
  REFUNDED: { label: "Refunded", classes: "bg-purple-50 text-purple-600" },
};

/**
 * Current or past: a drop order is past once its pickup day is over; walk-up
 * and gift card orders after a week. Ones waiting on a Venmo/PayPal check
 * always stay current.
 */
function isCurrent(o: Order, startOfToday: number) {
  if (o.status === "AWAITING_CONFIRM") return true;
  if (o.type === "DROP") {
    const pickup = o.pickupTime ?? o.pickupSlot?.endDate ?? o.pickupSlot?.pickupDate ?? o.drop?.orderCloseAt ?? o.createdAt;
    return new Date(pickup).getTime() >= startOfToday;
  }
  return new Date(o.createdAt).getTime() >= startOfToday - 6 * 86_400_000;
}

export default function AdminDashboardPage() {
  const site = useSite();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("ALL");
  const [when, setWhen] = useState<"current" | "past">("current");
  const [search, setSearch] = useState("");
  const [isUnauthorized, setIsUnauthorized] = useState(false);

  const loadOrders = async () => {
    try {
      const res = await fetch("/api/orders");
      if (res.status === 401) {
        setIsUnauthorized(true);
        setOrders([]);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setOrders(data);
        // A link to an older order (/admin#order-<id> from Customers) opens the Past list
        const linked = data.find((o: Order) => window.location.hash === `#order-${o.id}`);
        if (linked && !isCurrent(linked, new Date().setHours(0, 0, 0, 0))) setWhen("past");
        setIsUnauthorized(false);
      } else {
        setOrders([]);
      }
    } catch (e) {
      console.error(e);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  // Links like /admin#order-<id> (from Customers) scroll to and highlight that order
  useEffect(() => {
    if (loading || !window.location.hash.startsWith("#order-")) return;
    const el = document.getElementById(window.location.hash.slice(1));
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-amber-500");
  }, [loading]);

  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) loadOrders();
      else alert((await res.json().catch(() => ({}))).error || "Failed to update status");
    } catch {
      alert("Failed to update status");
    }
  };

  const deleteOrder = async (orderId: string) => {
    if (!confirm(`Delete order #${orderId.slice(-6).toUpperCase()} for good? It disappears from your sales records. This can't be undone.`)) return;
    const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
    if (res.ok) loadOrders();
    else alert((await res.json().catch(() => ({}))).error || "Couldn't delete the order");
  };

  const safeOrders = Array.isArray(orders) ? orders : [];
  // Search by name, email, phone (any format) or order number, e.g. from a customer's text
  const q = search.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const matches = (o: Order) =>
    !q ||
    [o.guestName, o.user?.name, o.guestEmail, o.user?.email, o.id.slice(-6)].some((v) => v?.toLowerCase().includes(q)) ||
    (qDigits.length >= 4 &&
      [o.guestPhone, o.user?.phone].some((p) => p?.replace(/\D/g, "").includes(qDigits.slice(-10))));
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const currentCount = safeOrders.filter((o) => isCurrent(o, startOfToday)).length;
  // A search looks through current and past orders
  const filteredOrders = safeOrders.filter(
    (o) =>
      (filterType === "ALL" || o.type === filterType) &&
      matches(o) &&
      (q || isCurrent(o, startOfToday) === (when === "current"))
  );

  const totalRevenue = safeOrders
    .filter((o) => o.status === "PAID")
    .reduce((sum, o) => sum + o.total, 0);
  const pendingCount = safeOrders.filter((o) => o.status === "AWAITING_CONFIRM").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Orders</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Pre-orders, {site.SITE_FARMSTAND_HEADING} purchases and gift cards.
        </p>
      </div>

      {isUnauthorized && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-amber-800">
              Sign in required
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Sign in with your admin email to manage orders.
            </p>
          </div>
          <a
            href="/login?callbackUrl=/admin"
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Sign In →
          </a>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-stone-200">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">
            Revenue
          </p>
          <p className="text-2xl font-bold text-stone-900 mt-1">
            {formatPrice(totalRevenue)}
          </p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-stone-200">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">
            Awaiting Confirmation
          </p>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            {pendingCount}
          </p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-stone-200">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">
            Total Orders
          </p>
          <p className="text-2xl font-bold text-stone-900 mt-1">
            {safeOrders.length}
          </p>
        </div>
      </div>

      {/* Filter Tabs + search */}
      <div className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name, email, phone or order #"
        className="w-full sm:w-72 border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
      />
      <div className="flex gap-1 bg-stone-100 p-1 rounded-lg w-fit">
        {(
          [
            { key: "current", label: `Current (${currentCount})` },
            { key: "past", label: `Past (${safeOrders.length - currentCount})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setWhen(tab.key)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              when === tab.key && !q ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1 bg-stone-100 p-1 rounded-lg w-fit">
        {[
          { key: "ALL", label: "All" },
          { key: "DROP", label: "Drops" },
          { key: "FARMSTAND", label: site.SITE_FARMSTAND_HEADING },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterType(tab.key)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filterType === tab.key
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-5 h-5 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
          <p className="text-sm text-stone-400 mt-2">Loading orders...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-xl p-10 border border-stone-200 text-center">
          <p className="text-stone-500 font-medium">
            {q
              ? "No orders match your search"
              : safeOrders.length
                ? `No ${when} orders${filterType === "ALL" ? "" : " of this kind"}`
                : "No orders yet"}
          </p>
          {!q && !safeOrders.length && (
            <p className="text-xs text-stone-400 mt-1">
              Orders will appear here as customers place them.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const email = order.guestEmail || order.user?.email || "Guest";
            const name = order.guestName || order.user?.name;
            const phone = order.guestPhone || order.user?.phone;
            const status = statusConfig[order.status] || {
              label: order.status,
              classes: "bg-stone-100 text-stone-600",
            };

            return (
              <div
                key={order.id}
                id={`order-${order.id}`}
                className="bg-white rounded-xl border border-stone-200 p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-stone-500 bg-stone-50 px-2 py-0.5 rounded">
                      #{order.id.slice(-6).toUpperCase()}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        order.type === "FARMSTAND"
                          ? "bg-orange-50 text-orange-600"
                          : order.type === "GIFT"
                          ? "bg-pink-50 text-pink-600"
                          : "bg-blue-50 text-blue-600"
                      }`}
                    >
                      {order.type === "FARMSTAND"
                        ? site.SITE_FARMSTAND_HEADING
                        : order.type === "GIFT"
                        ? "🎁 Gift card"
                        : "Drop"}
                    </span>
                    <span className="text-[11px] text-stone-400 font-medium">
                      {order.paymentMethod}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-stone-900">
                      {formatPrice(order.total)}
                    </span>
                    {order.discountCode && (
                      <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        {order.discountCode} −{formatPrice(order.discount)}
                      </span>
                    )}
                    {order.giftCode && (
                      <span className="text-[11px] text-pink-700 bg-pink-50 px-2 py-0.5 rounded-full">
                        🎁 −{formatPrice(order.giftAmount)}
                      </span>
                    )}
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${status.classes}`}
                    >
                      {status.label}
                    </span>
                  </div>
                </div>

                {name && <p className="text-sm font-semibold text-stone-900 -mt-1 mb-1">{name}</p>}
                <div className="text-xs text-stone-500 mb-3">
                  <span>{email}</span>
                  {phone && <span className="ml-3">📞 {phone}</span>}
                  {order.pickupSlot && (
                    <span className="ml-3">
                      📍{" "}
                      {order.pickupTime
                        ? new Date(order.pickupTime).toLocaleString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : order.pickupSlot.label}
                      {order.pickupSlot.location && ` · ${order.pickupSlot.location}`}
                    </span>
                  )}
                </div>

                {/* Items */}
                <div className="bg-stone-50 rounded-lg p-3 text-xs space-y-1 mb-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between">
                      <span className="text-stone-700">
                        {item.quantity}×{" "}
                        {item.dropProduct?.product.name ||
                          item.farmstandItem?.name ||
                          "Item"}
                        {describePicks(item.selections) && (
                          <span className="block pl-4 text-stone-500">{describePicks(item.selections)}</span>
                        )}
                        {describeAddOns(item.addOns) && (
                          <span className="block pl-4 font-semibold text-amber-800">{describeAddOns(item.addOns)}</span>
                        )}
                      </span>
                      <span className="text-stone-500">
                        {formatPrice(item.priceAtPurchase * item.quantity)}
                      </span>
                    </div>
                  ))}
                  {order.notes && (
                    <div className="pt-1.5 mt-1.5 border-t border-stone-200 text-stone-400 italic">
                      &ldquo;{order.notes}&rdquo;
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  {order.status === "AWAITING_CONFIRM" && (
                    <button
                      onClick={() => updateOrderStatus(order.id, "PAID")}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors"
                    >
                      ✓ Confirm Payment
                    </button>
                  )}
                  {order.status === "PAID" && (
                    <button
                      onClick={() => updateOrderStatus(order.id, "READY")}
                      className="bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors"
                    >
                      Mark Ready
                    </button>
                  )}
                  {["PAID", "READY"].includes(order.status) && order.type !== "GIFT" && (
                    <button
                      onClick={async () => {
                        if (!confirm("Send the order confirmation (email, and text if they gave a phone) again?")) return;
                        const res = await fetch(`/api/orders/${order.id}/resend`, { method: "POST" });
                        const data = await res.json().catch(() => ({}));
                        alert(res.ok ? "Sent." : data.error || "Couldn't send it");
                      }}
                      className="bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Resend confirmation
                    </button>
                  )}
                  {order.status === "READY" && (
                    <button
                      onClick={() => updateOrderStatus(order.id, "PICKED_UP")}
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors"
                    >
                      ✓ Picked Up
                    </button>
                  )}
                  {order.status !== "CANCELLED" && order.status !== "REFUNDED" && order.status !== "PICKED_UP" && (
                    <button
                      onClick={() => {
                        const card = order.paymentMethod === "STRIPE" && ["PAID", "READY"].includes(order.status);
                        const msg = card
                          ? `Cancel order #${order.id.slice(-6).toUpperCase()}? ${formatPrice(order.total)} will be refunded to their card.`
                          : `Cancel order #${order.id.slice(-6).toUpperCase()}?`;
                        if (confirm(msg)) updateOrderStatus(order.id, "CANCELLED");
                      }}
                      className="text-stone-400 hover:text-red-600 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ml-auto"
                    >
                      Cancel
                    </button>
                  )}
                  {["CANCELLED", "REFUNDED", "PENDING"].includes(order.status) && (
                    <button
                      onClick={() => deleteOrder(order.id)}
                      className="text-stone-400 hover:text-red-600 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ml-auto"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
