"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "welcome" | "admin" | "stripe" | "notifications" | "done";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [stripeSecret, setStripeSecret] = useState("");
  const [stripePublishable, setStripePublishable] = useState("");
  const [stripeWebhook, setStripeWebhook] = useState("");
  const [paypalUsername, setPaypalUsername] = useState("");
  const [venmoUsername, setVenmoUsername] = useState("");
  const [n8nUrl, setN8nUrl] = useState("");
  const [n8nSecret, setN8nSecret] = useState("");

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail,
          adminName,
          businessName,
          appUrl,
          stripeSecret,
          stripePublishable,
          stripeWebhook,
          paypalUsername,
          venmoUsername,
          n8nUrl,
          n8nSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Setup failed");
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-8">
        {/* Progress dots */}
        <div className="flex gap-2 mb-8">
          {(["welcome", "admin", "stripe", "notifications"] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-2 flex-1 rounded-full transition-colors ${
                step === s || (step === "done" && s === "notifications")
                  ? "bg-green-600"
                  : ["welcome", "admin", "stripe", "notifications"].indexOf(s) <
                    ["welcome", "admin", "stripe", "notifications"].indexOf(step as Step)
                  ? "bg-green-400"
                  : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* Step: Welcome */}
        {step === "welcome" && (
          <div>
            <div className="text-4xl mb-4">🌿</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Welcome to Farm Stand
            </h1>
            <p className="text-gray-600 mb-6">
              Let&apos;s get your farm stand set up in a few quick steps. You&apos;ll need:
            </p>
            <ul className="space-y-2 mb-8 text-sm text-gray-700">
              <li className="flex items-center gap-2">
                <span className="text-green-600">✓</span> Your admin email address
              </li>
              <li className="flex items-center gap-2">
                <span className="text-gray-400">○</span> Stripe API keys (optional){" "}
                <a
                  href="https://dashboard.stripe.com/apikeys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-green-600 underline"
                >
                  (get them here)
                </a>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-gray-400">○</span> n8n webhook URL (optional)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-gray-400">○</span> PayPal / Venmo usernames (optional)
              </li>
            </ul>
            <button
              onClick={() => setStep("admin")}
              className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors"
            >
              Let&apos;s go →
            </button>
          </div>
        )}

        {/* Step: Admin Account */}
        {step === "admin" && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Admin Account</h2>
            <p className="text-gray-500 text-sm mb-6">
              You&apos;ll receive a magic-link login email here.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business Name
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Your Shop Name"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  You can change this and all the site text later in Admin → Settings.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Your name"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Admin Email
                </label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  App URL
                </label>
                <input
                  type="url"
                  value={appUrl}
                  onChange={(e) => setAppUrl(e.target.value)}
                  placeholder="https://shop.example.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Used for magic-link emails and Stripe webhook setup
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep("welcome")}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-xl font-medium hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={() => setStep("stripe")}
                disabled={!adminEmail || !adminName || !appUrl}
                className="flex-1 bg-green-600 text-white py-2 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step: Stripe */}
        {step === "stripe" && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Payments</h2>
            <p className="text-gray-500 text-sm mb-1">
              Stripe powers embedded checkout.{" "}
              <a
                href="https://dashboard.stripe.com/apikeys"
                target="_blank"
                rel="noreferrer"
                className="text-green-600 underline"
              >
                Get your keys →
              </a>
            </p>
            <p className="text-xs text-gray-400 mb-4">
              Optional — skip to take Venmo/PayPal only. You can add or change these
              later in Admin → Settings. Use test keys (sk_test_...) while trying things out.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Secret Key
                </label>
                <input
                  type="password"
                  value={stripeSecret}
                  onChange={(e) => setStripeSecret(e.target.value)}
                  placeholder="sk_test_..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Publishable Key
                </label>
                <input
                  type="text"
                  value={stripePublishable}
                  onChange={(e) => setStripePublishable(e.target.value)}
                  placeholder="pk_test_..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Webhook Secret{" "}
                  <span className="text-gray-400 font-normal">(optional for now)</span>
                </label>
                <input
                  type="password"
                  value={stripeWebhook}
                  onChange={(e) => setStripeWebhook(e.target.value)}
                  placeholder="whsec_..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Add at:{" "}
                  <span className="font-mono">{appUrl}/api/payments/stripe/webhook</span>
                </p>
              </div>
              <hr className="border-gray-100" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PayPal.me username
                  </label>
                  <input
                    type="text"
                    value={paypalUsername}
                    onChange={(e) => setPaypalUsername(e.target.value)}
                    placeholder="username"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Venmo username
                  </label>
                  <input
                    type="text"
                    value={venmoUsername}
                    onChange={(e) => setVenmoUsername(e.target.value)}
                    placeholder="username"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep("admin")}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-xl font-medium hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={() => setStep("notifications")}
                disabled={!!stripeSecret !== !!stripePublishable}
                className="flex-1 bg-green-600 text-white py-2 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step: Notifications */}
        {step === "notifications" && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Notifications</h2>
            <p className="text-gray-500 text-sm mb-6">
              Connect n8n to send SMS and email notifications. Skip this if you&apos;re not
              ready — you can add it later in Admin → Settings.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  n8n Webhook Base URL
                </label>
                <input
                  type="url"
                  value={n8nUrl}
                  onChange={(e) => setN8nUrl(e.target.value)}
                  placeholder="http://n8n:5678/webhook"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Webhook Secret{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="password"
                  value={n8nSecret}
                  onChange={(e) => setN8nSecret(e.target.value)}
                  placeholder="your_secret"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep("stripe")}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-xl font-medium hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-green-600 text-white py-2 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-60"
              >
                {loading ? "Setting up..." : "Finish Setup →"}
              </button>
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full mt-2 text-sm text-gray-400 hover:text-gray-600 py-2"
            >
              Skip notifications for now
            </button>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re all set!</h2>
            <p className="text-gray-600 mb-8">
              Your farm stand is ready. Head to the admin panel to add your first
              products and create this week&apos;s drop.
            </p>
            <button
              onClick={() => router.push("/admin")}
              className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700"
            >
              Go to Admin Panel →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
