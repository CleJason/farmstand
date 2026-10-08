"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useSite } from "@/components/SiteProvider";
import { ShopBrand } from "@/components/StoreChrome";
import LegalFooter from "@/components/LegalFooter";

function LoginForm() {
  const site = useSite();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const forAdmin = callbackUrl.startsWith("/admin");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (forAdmin) {
        const check = await fetch("/api/login/admin-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }).then((r) => r.json());
        if (!check.admin) {
          setError("That email isn't an admin for this site.");
          return;
        }
      }
      const res = await signIn("nodemailer", {
        email,
        callbackUrl,
        redirect: false,
      });
      if (res?.error) throw new Error(res.error);
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-2xl border border-stone-200 p-8 shadow-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-stone-900">
            {forAdmin ? "Admin sign in" : "Welcome back"}
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Sign in to {site.SITE_NAME}
            {forAdmin && " admin"}
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-3">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
              <span className="text-emerald-600 text-xl">✉</span>
            </div>
            <div>
              <p className="text-stone-900 font-medium">Check your email</p>
              <p className="text-sm text-stone-500 mt-1">
                We sent a magic link to{" "}
                <span className="font-medium text-stone-700">{email}</span>
              </p>
            </div>
            <p className="text-xs text-stone-400">
              The link expires in 24 hours.
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all placeholder:text-stone-400"
                />
              </div>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Sending..." : "Send Magic Link"}
              </button>
            </form>
            <p className="text-xs text-stone-400 mt-4 text-center">
              {forAdmin
                ? "Only the shop's admin emails can sign in here."
                : "No password needed. New customers are registered automatically."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col">
      <nav className="border-b border-stone-100 bg-white/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center">
          <ShopBrand className="text-lg" />
        </div>
      </nav>
      <div className="flex-1 flex items-center justify-center p-4">
        <Suspense
          fallback={
            <div className="p-8 text-center text-stone-500">Loading...</div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
      <LegalFooter />
    </div>
  );
}
