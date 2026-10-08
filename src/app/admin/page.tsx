"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";

interface Order {
  id: string;
  type: string;
  status: string;
  paymentMethod: string;
  total: number;
  notes: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  manualPaymentRef: string | null;
  createdAt: string;
  pickupSlot: { label: string } | null;
  user: { name: string | null; email: string; phone: string | null } | null;
  drop: { title: string } | null;
  items: {
    id: string;
    quantity: number;
    priceAtPurchase: number;
    dropProduct: { product: { name: string } } | null;
    farmstandItem: { name: string } | null;
  }[];
}

const statusConfig: Record<string, { label: string; classes: string }> = {
  PAID: { label: "Paid", classes: "bg-emerald-50 text-emerald-700" },
  AWAITING_CONFIRM: { label: "Awaiting Confirm", classes: "bg-amber-50 text-amber-700" },
  READY: { label: "Ready", classes: "bg-blue-50 text-blue-700" },
  PICKED_UP: { label: "Picked Up", classes: "bg-stone-100 text-stone-600" },
  PENDING: { label: "Pending", classes: "bg-stone-100 text-stone-500" },
  CANCELLED: { label: "Cancelled", classes: "bg-red-50 text-red-600" },
  REFUNDED: { label: "Refunded", classes: "bg-purple-50 text-purple-600" },
};

export default function AdminDashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("ALL");
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
    } catch {
      alert("Failed to update status");
    }
  };

  const safeOrders = Array.isArray(orders) ? orders : [];
  const filteredOrders = safeOrders.filter((o) => {
    if (filterType === "ALL") return true;
    return o.type === filterType;
  });

  const totalRevenue = safeOrders
    .filter((o) => o.status === "PAID")
    .reduce((sum, o) => sum + o.total, 0);
  const pendingCount = safeOrders.filter((o) => o.status === "AWAITING_CONFIRM").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Orders</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Manage pre-orders and farmstand purchases.
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

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-stone-100 p-1 rounded-lg w-fit">
        {[
          { key: "ALL", label: "All" },
          { key: "DROP", label: "Drops" },
          { key: "FARMSTAND", label: "Farmstand" },
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

      {/* Orders List */}
      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-5 h-5 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
          <p className="text-sm text-stone-400 mt-2">Loading orders...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-xl p-10 border border-stone-200 text-center">
          <p className="text-stone-500 font-medium">No orders yet</p>
          <p className="text-xs text-stone-400 mt-1">
            Orders will appear here as customers place them.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const email = order.guestEmail || order.user?.email || "Guest";
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
                          : "bg-blue-50 text-blue-600"
                      }`}
                    >
                      {order.type === "FARMSTAND" ? "Farmstand" : "Drop"}
                    </span>
                    <span className="text-[11px] text-stone-400 font-medium">
                      {order.paymentMethod}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-stone-900">
                      {formatPrice(order.total)}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${status.classes}`}
                    >
                      {status.label}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-stone-500 mb-3">
                  <span>{email}</span>
                  {order.pickupSlot && (
                    <span className="ml-3">📍 {order.pickupSlot.label}</span>
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
                  {order.status === "READY" && (
                    <button
                      onClick={() => updateOrderStatus(order.id, "PICKED_UP")}
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors"
                    >
                      ✓ Picked Up
                    </button>
                  )}
                  {order.status !== "CANCELLED" && order.status !== "PICKED_UP" && (
                    <button
                      onClick={() => updateOrderStatus(order.id, "CANCELLED")}
                      className="text-stone-400 hover:text-red-600 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ml-auto"
                    >
                      Cancel
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
