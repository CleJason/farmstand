"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { BoxPick } from "@/lib/box";
import type { AddOn } from "@/lib/addons";
import { AddOnChecklist } from "@/components/AddOnPicker";
import { useText } from "@/components/SiteProvider";

/**
 * Bottom sheet where the customer fills one mix & match box: a stepper per
 * option, and "Add to order" once the picks add up to the box size.
 */
export default function BoxBuilder({
  name,
  price,
  boxSize,
  options,
  addOns = [],
  onAdd,
  onClose,
}: {
  name: string;
  price: number;
  boxSize: number;
  options: string[];
  addOns?: AddOn[];
  onAdd: (picks: BoxPick[], addOnNames: string[]) => void;
  onClose: () => void;
}) {
  const text = useText();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [extras, setExtras] = useState<string[]>([]);
  const chosen = Object.values(counts).reduce((a, b) => a + b, 0);
  const left = boxSize - chosen;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const change = (option: string, delta: number) =>
    setCounts((prev) => {
      const next = Math.max(0, (prev[option] ?? 0) + delta);
      if (delta > 0 && left <= 0) return prev;
      return { ...prev, [option]: next };
    });

  // One option: just fill the box with it
  const fillWith = (option: string) => setCounts({ [option]: boxSize });

  const add = () => {
    onAdd(
      options.filter((o) => (counts[o] ?? 0) > 0).map((o) => ({ name: o, quantity: counts[o] })),
      extras
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-label={`Build your ${name}`}
        className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-stone-100">
          <div>
            <h2 className="font-bold text-lg text-[#2D1E18]">{name}</h2>
            <p className="text-sm text-[#735D54]">
              {text("box.choose", { count: boxSize })} · {formatPrice(price)}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 text-stone-400 hover:text-stone-800">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-3 divide-y divide-stone-100">
          {options.map((option) => {
            const n = counts[option] ?? 0;
            return (
              <div key={option} className="flex items-center justify-between gap-3 py-3">
                <button
                  type="button"
                  onClick={() => fillWith(option)}
                  title={`Make it all ${option}`}
                  className="text-left text-sm font-medium text-[#2D1E18] min-w-0"
                >
                  {option}
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={n === 0}
                    onClick={() => change(option, -1)}
                    aria-label={`One less ${option}`}
                    className="w-8 h-8 rounded-lg border border-stone-200 font-bold disabled:opacity-30 hover:bg-stone-50"
                  >
                    -
                  </button>
                  <span className="w-6 text-center font-bold text-sm">{n}</span>
                  <button
                    type="button"
                    disabled={left <= 0}
                    onClick={() => change(option, 1)}
                    aria-label={`One more ${option}`}
                    className="w-8 h-8 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-stone-100 space-y-2">
          <AddOnChecklist addOns={addOns} chosen={extras} onChange={setExtras} />
          <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${Math.min(100, (chosen / boxSize) * 100)}%` }}
            />
          </div>
          <button
            type="button"
            disabled={left !== 0}
            onClick={add}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl disabled:opacity-50 text-sm"
          >
            {left > 0
              ? text("box.chooseMore", { count: left })
              : text("box.add", {
                  price: formatPrice(price + addOns.filter((a) => extras.includes(a.name)).reduce((s, a) => s + a.price, 0)),
                })}
          </button>
        </div>
      </div>
    </div>
  );
}
