import { prisma } from "@/lib/prisma";

export async function getSetting(key: string, defaultValue = ""): Promise<string> {
  try {
    const item = await prisma.setting.findUnique({ where: { key } });
    if (item && item.value) return item.value;
  } catch (e) {
    // DB might not be ready or table not found
  }
  return process.env[key] || defaultValue;
}

/**
 * Accept a pasted Venmo/PayPal.me link or @handle and keep just the username,
 * e.g. "https://account.venmo.com/u/Your-Shop?txn=pay&x=1" -> "Your-Shop".
 */
export function normalizeHandle(input: string): string {
  let v = input.trim();
  v = v.split(/[?#]/)[0];
  v = v.replace(/^https?:\/\//i, "").replace(/^(www\.|account\.)/i, "");
  v = v.replace(/^(venmo\.com|paypal\.me|paypal\.com\/paypalme)\/?/i, "");
  v = v.replace(/^u\//i, "");
  v = v.split("/").filter(Boolean)[0] ?? "";
  return v.replace(/^@/, "");
}

export async function getPaymentSettings() {
  const [
    stripeSecret,
    stripePublishable,
    paypalUsername,
    venmoUsername,
  ] = await Promise.all([
    getSetting("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY || ""),
    getSetting("STRIPE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""),
    getSetting("PAYPAL_ME_USERNAME", process.env.NEXT_PUBLIC_PAYPAL_ME_USERNAME || ""),
    getSetting("VENMO_USERNAME", process.env.NEXT_PUBLIC_VENMO_USERNAME || ""),
  ]);

  return {
    stripeSecret,
    stripePublishable,
    paypalUsername,
    venmoUsername,
    hasStripe: !!(stripeSecret && stripePublishable),
    hasPaypal: !!paypalUsername,
    hasVenmo: !!venmoUsername,
  };
}
