"use client";

import { useEffect, useState } from "react";

type Loaded = {
  STRIPE_PUBLISHABLE_KEY: string;
  PAYPAL_ME_USERNAME: string;
  VENMO_USERNAME: string;
  N8N_WEBHOOK_BASE_URL: string;
  secrets: Record<"STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET" | "N8N_WEBHOOK_SECRET", string>;
  stripeWebhookUrl: string;
};

const inputClass =
  "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-stone-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-stone-400 mt-1">{hint}</span>}
    </label>
  );
}

export default function PaymentSettings() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [plain, setPlain] = useState<Record<string, string>>({});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/settings/payments");
    if (!res.ok) return;
    const data: Loaded = await res.json();
    setLoaded(data);
    setPlain({
      STRIPE_PUBLISHABLE_KEY: data.STRIPE_PUBLISHABLE_KEY,
      PAYPAL_ME_USERNAME: data.PAYPAL_ME_USERNAME,
      VENMO_USERNAME: data.VENMO_USERNAME,
      N8N_WEBHOOK_BASE_URL: data.N8N_WEBHOOK_BASE_URL,
    });
    setSecrets({});
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/payments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...plain, ...secrets }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save");
      setMessage("Saved. Changes apply right away.");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="h-24 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
      </div>
    );
  }

  const secretInput = (key: keyof Loaded["secrets"], placeholder: string) => (
    <input
      type="password"
      autoComplete="off"
      value={secrets[key] ?? ""}
      onChange={(e) => setSecrets({ ...secrets, [key]: e.target.value })}
      placeholder={loaded.secrets[key] ? `${loaded.secrets[key]} (leave blank to keep)` : placeholder}
      className={`${inputClass} font-mono`}
    />
  );
  const plainInput = (key: string, placeholder: string, mono = false) => (
    <input
      type="text"
      value={plain[key] ?? ""}
      onChange={(e) => setPlain({ ...plain, [key]: e.target.value })}
      placeholder={placeholder}
      className={`${inputClass} ${mono ? "font-mono" : ""}`}
    />
  );

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Stripe (cards)</h3>
        <p className="text-xs text-stone-500">
          Keys are at{" "}
          <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer" className="text-amber-700 underline">
            dashboard.stripe.com/apikeys
          </a>
          . Use test keys while trying things out. Leave empty to skip card payments.
        </p>
        <Field label="Secret key">{secretInput("STRIPE_SECRET_KEY", "sk_test_...")}</Field>
        <Field label="Publishable key">{plainInput("STRIPE_PUBLISHABLE_KEY", "pk_test_...", true)}</Field>
        <Field
          label="Webhook signing secret"
          hint={
            <>
              In Stripe → Developers → Webhooks, add an endpoint for{" "}
              <span className="font-mono text-stone-600 break-all">{loaded.stripeWebhookUrl}</span> with the
              payment_intent.succeeded and payment_intent.payment_failed events, then paste its signing secret here.
            </>
          }
        >
          {secretInput("STRIPE_WEBHOOK_SECRET", "whsec_...")}
        </Field>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Venmo &amp; PayPal</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Venmo username">{plainInput("VENMO_USERNAME", "username")}</Field>
          <Field label="PayPal.me username">{plainInput("PAYPAL_ME_USERNAME", "username")}</Field>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Notifications (n8n)</h3>
        <p className="text-xs text-stone-500">
          Order emails and text messages to customers (and alerts to you) are sent by n8n. Texts go through SMS Gate,
          which is set up inside the sample n8n workflow (n8n/order-notifications-workflow.json), not here.
        </p>
        <Field label="Webhook base URL">{plainInput("N8N_WEBHOOK_BASE_URL", "http://n8n:5678/webhook", true)}</Field>
        <Field label="Webhook secret">{secretInput("N8N_WEBHOOK_SECRET", "optional")}</Field>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {message && <p className="text-xs text-stone-500">{message}</p>}
      </div>
    </form>
  );
}
