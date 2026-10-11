"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { AddOn } from "@/lib/addons";
import { useText } from "@/components/SiteProvider";

/** Checkboxes for a product's extras (e.g. "Extra icing +$1.00"); used for products and boxes. */
export function AddOnChecklist({
  addOns,
  chosen,
  onChange,
}: {
  addOns: AddOn[];
  chosen: string[];
  onChange: (names: string[]) => void;
}) {
  const text = useText();
  if (addOns.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold text-[#2D1E18]">{text("addon.title")}</p>
      {addOns.map((a) => (
        <label key={a.name} className="flex items-center justify-between gap-3 py-1.5 text-sm text-[#2D1E18] cursor-pointer">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={chosen.includes(a.name)}
              onChange={(e) => onChange(e.target.checked ? [...chosen, a.name] : chosen.filter((n) => n !== a.name))}
              className="h-4 w-4 accent-amber-600"
            />
            {a.name}
          </span>
          <span className="text-[#735D54]">{a.price > 0 ? `+${formatPrice(a.price)}` : text("addon.free")}</span>
        </label>
      ))}
    </div>
  );
}

/** Bottom sheet to add a product that has extras: pick add-ons and how many. */
export default function AddOnPicker({
  name,
  price,
  addOns,
  maxQty,
  onAdd,
  onClose,
}: {
  name: string;
  price: number;
  addOns: AddOn[];
  maxQty: number | null;
  onAdd: (quantity: number, addOnNames: string[]) => void;
  onClose: () => void;
}) {
  const text = useText();
  const [chosen, setChosen] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const each = price + addOns.filter((a) => chosen.includes(a.name)).reduce((s, a) => s + a.price, 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-label={name} className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg text-[#2D1E18]">{name}</h2>
            <p className="text-sm text-[#735D54]">{text("addon.each", { price: formatPrice(price) })}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 text-stone-400 hover:text-stone-800">
            <X size={20} />
          </button>
        </div>
        <AddOnChecklist addOns={addOns} chosen={chosen} onChange={setChosen} />
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[#2D1E18]">{text("addon.howMany")}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-8 h-8 rounded-lg border border-stone-200 font-bold">
              -
            </button>
            <span className="w-6 text-center font-bold text-sm">{qty}</span>
            <button
              disabled={maxQty !== null && qty >= maxQty}
              onClick={() => setQty((q) => q + 1)}
              className="w-8 h-8 rounded-lg bg-amber-600 text-white font-bold disabled:opacity-30"
            >
              +
            </button>
          </div>
        </div>
        <button
          disabled={maxQty !== null && maxQty < 1}
          onClick={() => onAdd(qty, chosen)}
          className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50"
        >
          {text("box.add", { price: formatPrice(each * qty) })}
        </button>
      </div>
    </div>
  );
}
