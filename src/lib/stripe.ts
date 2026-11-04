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

/** How a payment reads in the Stripe dashboard: "Order #UBJG82 - Jane Smith" */
export function stripeDescription(orderId: string, name: string | null | undefined): string {
  return `Order #${orderId.slice(-6).toUpperCase()}${name ? ` - ${name}` : ""}`;
}

/**
 * Puts the order number and customer's name on a payment. The payment is made
 * before the order, so this comes after; a failure here never stops the order.
 */
export async function labelStripePayment(stripe: Stripe, paymentIntentId: string, orderId: string, name: string | null | undefined) {
  try {
    await stripe.paymentIntents.update(paymentIntentId, {
      description: stripeDescription(orderId, name),
      metadata: { orderId, customerName: name ?? "" },
    });
  } catch (e) {
    console.error("[stripe] Couldn't label the payment:", e);
  }
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
