"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

interface Drop {
  id: string;
  title: string;
  description: string | null;
  orderOpenAt: string;
  orderCloseAt: string;
  status: string;
  pickupSlots: { id: string; label: string; pickupDate: string }[];
  dropProducts: {
    id: string;
    quantityLimit: number | null;
    quantitySold: number;
    product: { name: string };
  }[];
  orders: { id: string; total: number; status: string }[];
}

interface Product {
  id: string;
  name: string;
  price: number;
}

export default function AdminDropsPage() {
  const [drops, setDrops] = useState<Drop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // New drop form
  const [title, setTitle] = useState("This Week's Drop");
  const [description, setDescription] = useState(
    "Pre-order during the ordering window, then pick up at your chosen time."
  );
  const [orderOpenAt, setOrderOpenAt] = useState("");
  const [orderCloseAt, setOrderCloseAt] = useState("");

  // Slots
  const [slots, setSlots] = useState<{ label: string; pickupDate: string }[]>([
    { label: "Friday Pickup · 2:00 PM – 6:00 PM", pickupDate: "" },
    { label: "Saturday Pickup · 9:00 AM – 1:00 PM", pickupDate: "" },
  ]);

  // Selected products for this drop
  const [selectedItems, setSelectedItems] = useState<{
    [productId: string]: number;
  }>({});

  const loadData = async () => {
    try {
      const [dropsRes, prodRes] = await Promise.all([
        fetch("/api/drops"),
        fetch("/api/products"),
      ]);
      const dropsData = await dropsRes.json();
      const prodData = await prodRes.json();
      setDrops(dropsData);
      setProducts(prodData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateDrop = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dropProductsPayload = Object.entries(selectedItems)
        .filter(([_, qty]) => qty > 0)
        .map(([productId, quantityLimit]) => ({
          productId,
          quantityLimit,
        }));

      const res = await fetch("/api/drops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          orderOpenAt,
          orderCloseAt,
          status: "OPEN",
          pickupSlots: slots.filter((s) => s.label && s.pickupDate),
          products: dropProductsPayload,
        }),
      });

      if (res.ok) {
        setShowModal(false);
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create drop");
      }
    } catch (e) {
      alert("Error creating drop");
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
    } catch (e) {
      alert("Failed to update status");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-[#2D1E18] tracking-tight">
            Weekly Pre-Order Drops
          </h1>
          <p className="text-sm text-[#735D54] mt-1">
            Set ordering windows and pickup times for each drop.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-[#C85A32] hover:bg-[#B24D28] text-white font-bold text-sm px-5 py-2.5 rounded-xl transition duration-150 shadow-sm flex items-center gap-2"
        >
          <span>+</span>
          <span>Create New Drop</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#8A756C] font-medium">
          Loading drops...
        </div>
      ) : drops.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-stone-200 text-center space-y-2">
          <div className="text-3xl">🌾</div>
          <p className="text-stone-500 font-semibold">No drops created yet.</p>
          <p className="text-xs text-stone-400">
            Click &quot;+ Create New Drop&quot; to schedule your first weekly batch!
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {drops.map((drop) => {
            const totalOrders = drop.orders?.length || 0;
            return (
              <div
                key={drop.id}
                className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm flex flex-col justify-between space-y-4 hover:border-[#E8DFD5] transition duration-150"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-full ${
                        drop.status === "OPEN"
                          ? "bg-[#EBF2EA] text-[#2E6B38] border border-[#D1E3D0]"
                          : drop.status === "CLOSED"
                          ? "bg-stone-100 text-stone-600"
                          : "bg-[#FEF5E7] text-[#B86B1E] border border-[#FAD7A0]"
                      }`}
                    >
                      {drop.status === "OPEN" ? "Ordering Open" : drop.status}
                    </span>
                    <span className="text-xs text-[#8A756C] font-medium">
                      {totalOrders} {totalOrders === 1 ? "order" : "orders"} placed
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-[#2D1E18]">
                    {drop.title}
                  </h3>
                  {drop.description && (
                    <p className="text-xs text-[#735D54] leading-relaxed">
                      {drop.description}
                    </p>
                  )}

                  <div className="bg-[#FAF6F0] p-3.5 rounded-xl text-xs space-y-1.5 border border-[#E8DFD5] text-[#2D1E18]">
                    <div>
                      <strong className="text-[#735D54]">Opens:</strong>{" "}
                      {formatDate(drop.orderOpenAt)}
                    </div>
                    <div>
                      <strong className="text-[#735D54]">Cutoff:</strong>{" "}
                      {formatDate(drop.orderCloseAt)}
                    </div>
                  </div>

                  <div className="text-xs space-y-1">
                    <div className="font-bold text-[#2D1E18]">
                      Offered this week:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {drop.dropProducts.map((dp) => (
                        <span
                          key={dp.id}
                          className="bg-[#FAF6F0] border border-[#E8DFD5] text-[#2D1E18] px-2.5 py-1 rounded-lg text-[11px] font-medium"
                        >
                          {dp.product.name} ({dp.quantitySold}/
                          {dp.quantityLimit ?? "∞"})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#F3ECE2] flex items-center justify-between gap-2">
                  <div className="flex gap-2">
                    {drop.status === "OPEN" ? (
                      <button
                        onClick={() => updateDropStatus(drop.id, "CLOSED")}
                        className="text-xs font-bold px-3 py-1.5 bg-[#FAF6F0] hover:bg-[#F3ECE2] text-[#2D1E18] border border-[#E8DFD5] rounded-xl transition duration-150"
                      >
                        Close Orders
                      </button>
                    ) : (
                      <button
                        onClick={() => updateDropStatus(drop.id, "OPEN")}
                        className="text-xs font-bold px-3.5 py-1.5 bg-[#C85A32] hover:bg-[#B24D28] text-white rounded-xl transition duration-150 shadow-sm"
                      >
                        Open Orders
                      </button>
                    )}
                  </div>
                  <Link
                    href={`/drops/${drop.id}`}
                    target="_blank"
                    className="text-xs text-[#C85A32] font-bold hover:underline"
                  >
                    Customer Menu ↗
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4 border border-stone-200">
            <h2 className="text-xl font-bold text-[#2D1E18]">Create New Drop</h2>
            <form onSubmit={handleCreateDrop} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#2D1E18] mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-sm px-3.5 py-2 border border-stone-200 rounded-xl focus:outline-none focus:border-[#C85A32]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2D1E18] mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-sm px-3.5 py-2 border border-stone-200 rounded-xl focus:outline-none focus:border-[#C85A32]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#2D1E18] mb-1">
                    Orders Open Date &amp; Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={orderOpenAt}
                    onChange={(e) => setOrderOpenAt(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-stone-200 rounded-xl focus:outline-none focus:border-[#C85A32]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#2D1E18] mb-1">
                    Orders Cutoff Date &amp; Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={orderCloseAt}
                    onChange={(e) => setOrderCloseAt(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-stone-200 rounded-xl focus:outline-none focus:border-[#C85A32]"
                  />
                </div>
              </div>

              {/* Slots */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#2D1E18]">
                  Pickup Slots
                </label>
                {slots.map((slot, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Slot label"
                      value={slot.label}
                      onChange={(e) => {
                        const copy = [...slots];
                        copy[idx].label = e.target.value;
                        setSlots(copy);
                      }}
                      className="text-xs px-3 py-2 border border-stone-200 rounded-xl focus:outline-none focus:border-[#C85A32]"
                    />
                    <input
                      type="datetime-local"
                      required
                      value={slot.pickupDate}
                      onChange={(e) => {
                        const copy = [...slots];
                        copy[idx].pickupDate = e.target.value;
                        setSlots(copy);
                      }}
                      className="text-xs px-3 py-2 border border-stone-200 rounded-xl focus:outline-none focus:border-[#C85A32]"
                    />
                  </div>
                ))}
              </div>

              {/* Items */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#2D1E18]">
                  Products to Offer (optional quantity limit)
                </label>
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#FAF6F0] border border-[#E8DFD5] text-xs"
                  >
                    <span className="font-semibold text-[#2D1E18]">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[#735D54]">Batch limit:</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={selectedItems[p.id] || ""}
                        onChange={(e) =>
                          setSelectedItems({
                            ...selectedItems,
                            [p.id]: Number(e.target.value),
                          })
                        }
                        className="w-16 px-2 py-1 bg-white border border-stone-200 rounded-lg text-center font-bold text-[#2D1E18]"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-stone-200 py-2.5 rounded-xl font-medium text-sm text-[#735D54] hover:bg-stone-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#C85A32] hover:bg-[#B24D28] text-white font-bold py-2.5 rounded-xl text-sm transition shadow-sm"
                >
                  Publish Drop
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
