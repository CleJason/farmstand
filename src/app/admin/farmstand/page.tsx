"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { formatPrice } from "@/lib/utils";
import ImageUpload from "@/components/ImageUpload";
import FarmstandQrCode from "@/components/FarmstandQrCode";
import { useSite } from "@/components/SiteProvider";
import ImagePositioner from "@/components/ImagePositioner";

interface FarmstandItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  imagePosition: string | null;
  available: boolean;
  quantityAvailable: number;
  quantitySold: number;
}

// A product from the catalog, used to fill in a new stand item
interface CatalogProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  imagePosition: string | null;
  active: boolean;
}

export default function AdminFarmstandPage() {
  const site = useSite();
  const [items, setItems] = useState<FarmstandItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePosition, setImagePosition] = useState<string | null>(null);
  const [quantityAvailable, setQuantityAvailable] = useState("5");
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);

  const loadItems = async () => {
    try {
      const res = await fetch("/api/farmstand");
      if (!res.ok) { setItems([]); return; }
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const openNew = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setPriceDollars("");
    setImageUrl("");
    setImagePosition(null);
    setQuantityAvailable("5");
    setShowAddModal(true);
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCatalog(Array.isArray(d) ? d.filter((p: CatalogProduct) => p.active) : []))
      .catch(() => {});
  };

  const fillFromProduct = (productId: string) => {
    const p = catalog.find((c) => c.id === productId);
    if (!p) return;
    setName(p.name);
    setDescription(p.description ?? "");
    setPriceDollars((p.price / 100).toFixed(2));
    setImageUrl(p.imageUrl ?? "");
    setImagePosition(p.imagePosition);
  };

  const openEdit = (item: FarmstandItem) => {
    setEditingId(item.id);
    setName(item.name);
    setDescription(item.description ?? "");
    setPriceDollars((item.price / 100).toFixed(2));
    setImageUrl(item.imageUrl ?? "");
    setImagePosition(item.imagePosition);
    setQuantityAvailable(String(item.quantityAvailable));
    setShowAddModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      name,
      description: description || null,
      price: Math.round(Number(priceDollars) * 100),
      imageUrl: imageUrl || null,
      imagePosition: imageUrl ? imagePosition : null,
      quantityAvailable: Number(quantityAvailable),
    };
    try {
      const res = editingId
        ? await fetch(`/api/farmstand/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/farmstand", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, available: true }),
          });
      if (!res.ok) throw new Error();
      setShowAddModal(false);
      loadItems();
    } catch {
      alert(editingId ? "Failed to save changes" : "Failed to create item");
    }
  };

  const updateItem = async (id: string, updates: Partial<FarmstandItem>) => {
    try {
      const res = await fetch(`/api/farmstand/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) loadItems();
    } catch {
      alert("Failed to update item");
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Remove this item?")) return;
    try {
      const res = await fetch(`/api/farmstand/${id}`, { method: "DELETE" });
      if (res.ok) loadItems();
    } catch {
      alert("Failed to delete");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900">{site.SITE_FARMSTAND_HEADING}</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Walk-up items customers pay for on the spot (QR code page).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FarmstandQrCode />
          <button
            onClick={openNew}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span className="text-base leading-none">+</span>
            Add Item
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-5 h-5 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl p-10 border border-stone-200 text-center">
          <p className="text-stone-500 font-medium">No items configured</p>
          <p className="text-xs text-stone-400 mt-1">
            Add items to show on your {site.SITE_FARMSTAND_HEADING} page.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const remaining = item.quantityAvailable - item.quantitySold;
            const isSoldOut = remaining <= 0;

            return (
              <div
                key={item.id}
                className={`bg-white rounded-xl border border-stone-200 overflow-hidden ${
                  !item.available ? "opacity-60" : ""
                }`}
              >
                {item.imageUrl ? (
                  <div className="relative w-full aspect-square bg-stone-100">
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      fill
                      className="object-cover"
                      style={{ objectPosition: item.imagePosition || undefined }}
                    />
                  </div>
                ) : (
                  <div className="w-full aspect-square bg-stone-50 flex items-center justify-center">
                    <span className="text-3xl">🛍️</span>
                  </div>
                )}

                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-stone-900 text-sm">
                        {item.name}
                      </h3>
                      {item.description && (
                        <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <span className="font-bold text-amber-600 text-sm whitespace-nowrap">
                      {formatPrice(item.price)}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        !item.available
                          ? "bg-stone-100 text-stone-500"
                          : isSoldOut
                          ? "bg-red-50 text-red-600"
                          : "bg-emerald-50 text-emerald-600"
                      }`}
                    >
                      {!item.available
                        ? "Hidden"
                        : isSoldOut
                        ? "Sold Out"
                        : "Live"}
                    </span>
                  </div>

                  {/* Stock Controls */}
                  <div className="bg-stone-50 rounded-lg p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-stone-500">Stock</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() =>
                            updateItem(item.id, {
                              quantityAvailable: Math.max(0, item.quantityAvailable - 1),
                            })
                          }
                          className="w-6 h-6 bg-white border border-stone-200 rounded font-bold text-stone-600 hover:bg-stone-100 transition-colors flex items-center justify-center text-xs"
                        >
                          −
                        </button>
                        <span className="w-6 text-center font-bold text-stone-900">
                          {item.quantityAvailable}
                        </span>
                        <button
                          onClick={() =>
                            updateItem(item.id, {
                              quantityAvailable: item.quantityAvailable + 1,
                            })
                          }
                          className="w-6 h-6 bg-white border border-stone-200 rounded font-bold text-stone-600 hover:bg-stone-100 transition-colors flex items-center justify-center text-xs"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between text-stone-400">
                      <span>Sold: {item.quantitySold}</span>
                      <span className={isSoldOut ? "text-red-500" : "text-emerald-600"}>
                        Left: {Math.max(0, remaining)}
                      </span>
                    </div>
                    <button
                      onClick={() => updateItem(item.id, { quantitySold: 0 })}
                      className="text-[10px] text-stone-400 hover:text-amber-600 underline transition-colors"
                    >
                      Reset sold count
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => openEdit(item)}
                      className="text-xs font-medium py-2 px-3 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() =>
                        updateItem(item.id, { available: !item.available })
                      }
                      className={`flex-1 text-xs font-medium py-2 rounded-lg transition-colors ${
                        item.available
                          ? "bg-stone-100 hover:bg-stone-200 text-stone-700"
                          : "bg-amber-600 hover:bg-amber-700 text-white"
                      }`}
                    >
                      {item.available ? "Hide" : "Show on Stand"}
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="text-stone-400 hover:text-red-600 p-2 rounded-lg transition-colors text-xs"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-stone-900 mb-4">
              {editingId ? "Edit Item" : `Add ${site.SITE_FARMSTAND_HEADING} Item`}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              {!editingId && catalog.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">
                    Start from a product (optional)
                  </label>
                  <select
                    defaultValue=""
                    onChange={(e) => fillFromProduct(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  >
                    <option value="" disabled>
                      Choose from your products…
                    </option>
                    {catalog.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {formatPrice(p.price)}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-stone-400 mt-1">Copies the photo, name and price. You can still change them.</p>
                </div>
              )}
              <ImageUpload
                key={`${editingId ?? "new"}-${imageUrl}`}
                currentUrl={imageUrl || null}
                onUpload={(url) => {
                  setImageUrl(url);
                  setImagePosition(null);
                }}
              />
              {imageUrl && (
                <ImagePositioner url={imageUrl} position={imagePosition} onChange={setImagePosition} />
              )}

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dozen Eggs"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">
                  Description
                </label>
                <textarea
                  rows={5}
                  placeholder="Short description..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 resize-y"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">
                    Price ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="10.00"
                    value={priceDollars}
                    onChange={(e) => setPriceDollars(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">
                    {editingId ? "Stock put out" : "Initial Stock"}
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="5"
                    value={quantityAvailable}
                    onChange={(e) => setQuantityAvailable(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 border border-stone-200 py-2 rounded-lg font-medium text-sm text-stone-600 hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
                >
                  {editingId ? "Save" : "Add Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
