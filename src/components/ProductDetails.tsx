"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/** Bottom sheet with an item's big photo and full description (tap an item on the drop page). */
export default function ProductDetails({
  name,
  description,
  imageUrl,
  price,
  onClose,
}: {
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: string;
  onClose: () => void;
}) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-label={name}
        className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/90 text-stone-600 hover:text-stone-900 shadow"
        >
          <X size={18} />
        </button>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={name} className="w-full max-h-[50vh] object-cover rounded-t-3xl" />
        )}
        <div className="p-5 space-y-2">
          <h2 className="font-bold text-lg text-[#2D1E18] pr-8">{name}</h2>
          <p className="font-extrabold text-amber-600">{price}</p>
          {description && (
            <p className="text-sm text-[#735D54] leading-relaxed whitespace-pre-line">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
