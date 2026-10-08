import Stripe from "stripe";
import { getSetting } from "@/lib/settings";

let cached: { key: string; client: Stripe } | null = null;

/**
 * Stripe client built from the setup-wizard key (DB) with env fallback.
 * Returns null when Stripe isn't configured yet. Rebuilt if the key changes.
 */
export async function getStripe(): Promise<Stripe | null> {
  const key = await getSetting("STRIPE_SECRET_KEY");
  if (!key) return null;
  if (cached?.key !== key) {
    cached = {
      key,
      client: new Stripe(key, {
        apiVersion: "2026-09-30.endive" as any,
        typescript: true,
      }),
    };
  }
  return cached.client;
}

/** Format cents to dollar string, e.g. 1500 → "$15.00" */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/** Convert dollar string/number to cents */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}
