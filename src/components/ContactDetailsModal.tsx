"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useText } from "@/components/SiteProvider";

export type ContactDetails = { name: string; email: string; phone: string; notes: string };

const inputClass =
  "w-full text-sm px-3.5 py-2.5 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-600";

/**
 * First step of checkout: who the order is for. Shown after the customer picks
 * a payment method, before the card form / Venmo / PayPal step.
 */
export default function ContactDetailsModal({
  details,
  onChange,
  required,
  showNotes = true,
  submitting,
  error,
  onSubmit,
  onClose,
  extra,
}: {
  extra?: React.ReactNode; // e.g. the walk-up page's "text me when it's open" checkbox
  details: ContactDetails;
  onChange: (d: ContactDetails) => void;
  required: boolean; // pre-orders need name + email; walk-up purchases don't
  showNotes?: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const text = useText();
  const set = (patch: Partial<ContactDetails>) => onChange({ ...details, ...patch });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !submitting && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm overflow-y-auto overscroll-contain">
      <div className="min-h-full flex items-start sm:items-center justify-center p-3 sm:p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl relative my-2 space-y-4"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 text-stone-400 hover:text-stone-700"
          >
            <X size={20} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-[#2D1E18]">{text("checkout.detailsTitle")}</h2>
            <p className="text-sm text-[#735D54] mt-1">{text("checkout.detailsIntro")}</p>
          </div>

          <label className="block">
            <span className="block text-xs font-bold text-[#2D1E18] mb-1">
              {text("checkout.nameLabel")}
              {required ? " *" : ""}
            </span>
            <input
              type="text"
              required={required}
              autoComplete="name"
              maxLength={80}
              placeholder={text("checkout.namePlaceholder")}
              value={details.name}
              onChange={(e) => set({ name: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-[#2D1E18] mb-1">
              {text("checkout.emailLabel")}
              {required ? " *" : ""}
            </span>
            <input
              type="email"
              required={required}
              autoComplete="email"
              placeholder="you@example.com"
              value={details.email}
              onChange={(e) => set({ email: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-[#2D1E18] mb-1">{text("checkout.phoneLabel")}</span>
            <input
              type="tel"
              autoComplete="tel"
              placeholder="(555) 000-0000"
              value={details.phone}
              onChange={(e) => set({ phone: e.target.value })}
              className={inputClass}
            />
            <span className="block text-[11px] text-[#8A756C] mt-1">{text("checkout.smsConsent")}</span>
          </label>
          {showNotes && (
            <label className="block">
              <span className="block text-xs font-bold text-[#2D1E18] mb-1">{text("checkout.notesLabel")}</span>
              <input
                type="text"
                placeholder={text("checkout.notesPlaceholder")}
                value={details.notes}
                onChange={(e) => set({ notes: e.target.value })}
                className={inputClass}
              />
            </label>
          )}
          {extra}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            disabled={submitting}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50"
          >
            {submitting ? text("checkout.submitting") : text("checkout.continue")}
          </button>
        </form>
      </div>
    </div>
  );
}
