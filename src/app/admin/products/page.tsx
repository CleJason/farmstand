"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { formatPrice } from "@/lib/utils";
import ImageUpload from "@/components/ImageUpload";
import ImagePositioner from "@/components/ImagePositioner";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  imagePosition: string | null;
  category: string | null;
  active: boolean;
  boxSize: number | null;
  boxOptions: string[];
  addOns: { name: string; price: number }[];
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [category, setCategory] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePosition, setImagePosition] = useState<string | null>(null);
  const [isBox, setIsBox] = useState(false);
  const [boxSize, setBoxSize] = useState("");
  const [boxOptions, setBoxOptions] = useState("");
  // Add-ons as typed: name + dollars
  const [addOns, setAddOns] = useState<{ name: string; price: string }[]>([]);

  const loadProducts = async () => {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) { setProducts([]); return; }
      const data = await res.json();
      if (Array.isArray(data)) setProducts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const openNew = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setPriceDollars("");
    setCategory("");
    setImageUrl("");
    setImagePosition(null);
    setIsBox(false);
    setBoxSize("");
    setBoxOptions("");
    setAddOns([]);
    setShowModal(true);
  };

  const openEdit = (product: Product) => {
    setEditingId(product.id);
    setName(product.name);
    setDescription(product.description ?? "");
    setPriceDollars((product.price / 100).toFixed(2));
    setCategory(product.category ?? "");
    setImageUrl(product.imageUrl ?? "");
    setImagePosition(product.imagePosition);
    setIsBox(!!product.boxSize);
    setBoxSize(product.boxSize ? String(product.boxSize) : "");
    setBoxOptions((product.boxOptions ?? []).join("\n"));
    setAddOns((product.addOns ?? []).map((a) => ({ name: a.name, price: (a.price / 100).toFixed(2) })));
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const options = boxOptions.split("\n").map((o) => o.trim()).filter(Boolean);
    if (isBox) {
      const size = Number(boxSize);
      if (!Number.isInteger(size) || size < 1 || size > 100) {
        alert("Box size must be a whole number from 1 to 100");
        return;
      }
      if (options.length === 0) {
        alert("Add at least one option customers can choose for the box");
        return;
      }
    }
    const body = {
      name,
      description: description || null,
      price: Math.round(Number(priceDollars) * 100),
      category: category || null,
      imageUrl: imageUrl || null,
      imagePosition: imageUrl ? imagePosition : null,
      boxSize: isBox ? Number(boxSize) : null,
      boxOptions: isBox ? options : [],
      addOns: addOns
        .filter((a) => a.name.trim())
        .map((a) => ({ name: a.name.trim(), price: Math.round((Number(a.price) || 0) * 100) })),
    };
    try {
      const res = editingId
        ? await fetch(`/api/products/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, active: true }),
          });
      if (!res.ok) throw new Error();
      setShowModal(false);
      loadProducts();
    } catch {
      alert(editingId ? "Failed to save changes" : "Failed to create product");
    }
  };

  const toggleActive = async (product: Product) => {
    try {
      await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !product.active }),
      });
      loadProducts();
    } catch {
      alert("Failed to update product");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Products</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Your master catalog of products.
          </p>
        </div>
        <button
          onClick={openNew}
          className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <span className="text-base leading-none">+</span>
          Add Product
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-5 h-5 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-xl p-10 border border-stone-200 text-center">
          <p className="text-stone-500 font-medium">No products yet</p>
          <p className="text-xs text-stone-400 mt-1">
            Add your first product to get started.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <div
              key={product.id}
              className={`bg-white rounded-xl border border-stone-200 overflow-hidden hover:shadow-sm transition-shadow ${
                !product.active ? "opacity-60" : ""
              }`}
            >
              {product.imageUrl ? (
                <div className="relative w-full aspect-square bg-stone-100">
                  <Image
                    src={product.imageUrl}
                    alt={product.name}
                    fill
                    className="object-cover"
                    style={{ objectPosition: product.imagePosition || undefined }}
                  />
                </div>
              ) : (
                <div className="w-full aspect-square bg-stone-50 flex items-center justify-center">
                  <span className="text-3xl">🛍️</span>
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-stone-900 text-sm">
                      {product.name}
                    </h3>
                    {product.category && (
                      <span className="text-[11px] text-stone-400 font-medium">
                        {product.category}
                      </span>
                    )}
                  </div>
                  <span className="font-bold text-amber-600 text-sm whitespace-nowrap">
                    {formatPrice(product.price)}
                  </span>
                </div>
                {product.description && (
                  <p className="text-xs text-stone-500 mt-1.5 line-clamp-2">
                    {product.description}
                  </p>
                )}
                {product.boxSize && product.boxOptions?.length > 0 && (
                  <p className="text-[11px] text-amber-700 mt-1.5">
                    Box of {product.boxSize} · {product.boxOptions.length} choices
                  </p>
                )}
                {product.addOns?.length > 0 && (
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    Add-ons: {product.addOns.map((a) => `${a.name} +${formatPrice(a.price)}`).join(", ")}
                  </p>
                )}
                <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between">
                  <button
                    onClick={() => openEdit(product)}
                    className="text-xs font-medium px-2.5 py-1 rounded-md bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => toggleActive(product)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                      product.active
                        ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                        : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                    }`}
                  >
                    {product.active ? "Active" : "Archived"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-stone-900 mb-4">
              {editingId ? "Edit Product" : "New Product"}
            </h2>
            {editingId && (
              <p className="text-xs text-stone-500 -mt-2 mb-4">
                A new price applies to future orders. Drops with their own price for this product keep it.
              </p>
            )}
            <form onSubmit={handleSave} className="space-y-4">
              <ImageUpload
                key={editingId ?? "new"}
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
                  placeholder="e.g. Jar of Honey"
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
                  rows={8}
                  placeholder="What makes it special, ingredients, size..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-sm leading-relaxed px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 resize-y min-h-[160px]"
                />
                <span className="block text-[11px] text-stone-400 mt-1">
                  Line breaks show on the item&apos;s details. Drag the corner to make this box bigger.
                </span>
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
                    placeholder="12.00"
                    value={priceDollars}
                    onChange={(e) => setPriceDollars(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Produce, Baked Goods, Crafts"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-stone-200 p-3 space-y-2">
                <div>
                  <span className="block text-sm font-medium text-stone-800">Add-ons</span>
                  <span className="block text-xs text-stone-500">
                    Extras customers can tick, like &quot;Extra icing&quot;. The price is added per item.
                  </span>
                </div>
                {addOns.map((a, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={a.name}
                      onChange={(e) => setAddOns(addOns.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      placeholder="e.g. Extra icing"
                      className="flex-1 min-w-0 text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={a.price}
                      onChange={(e) => setAddOns(addOns.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                      placeholder="$ 1.00"
                      className="w-24 text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                    <button
                      type="button"
                      aria-label="Remove add-on"
                      onClick={() => setAddOns(addOns.filter((_, j) => j !== i))}
                      className="px-2 text-stone-400 hover:text-red-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setAddOns([...addOns, { name: "", price: "" }])}
                  className="text-xs font-semibold text-amber-700 hover:underline"
                >
                  + Add an add-on
                </button>
              </div>

              <div className="rounded-lg border border-stone-200 p-3 space-y-3">
                <label className="flex items-start gap-2 text-sm text-stone-800">
                  <input
                    type="checkbox"
                    checked={isBox}
                    onChange={(e) => setIsBox(e.target.checked)}
                    className="mt-0.5 accent-amber-600"
                  />
                  <span>
                    <span className="font-medium">Mix &amp; match box</span>
                    <span className="block text-xs text-stone-500">
                      Customers choose what goes in it, e.g. a 6-cookie box or a bread flight.
                    </span>
                  </span>
                </label>
                {isBox && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-stone-600 mb-1">Items per box *</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        placeholder="6"
                        value={boxSize}
                        onChange={(e) => setBoxSize(e.target.value)}
                        className="w-28 text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-600 mb-1">
                        Choices (one per line) *
                      </label>
                      <textarea
                        rows={4}
                        placeholder={"Chocolate Chip\nSnickerdoodle\nOatmeal Raisin"}
                        value={boxOptions}
                        onChange={(e) => setBoxOptions(e.target.value)}
                        className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 resize-y"
                      />
                      <p className="text-[11px] text-stone-400 mt-1">
                        Change these any week. The price above is for the whole box.
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-stone-200 py-2 rounded-lg font-medium text-sm text-stone-600 hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
