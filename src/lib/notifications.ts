import { getSetting } from "@/lib/settings";
import { getSiteSettings, isOn } from "@/lib/site";
import { describePicks } from "@/lib/box";

/**
 * Fire a notification event to n8n.
 * If N8N_WEBHOOK_BASE_URL is not set (setup wizard or env), this is a no-op.
 */

type NotificationEvent =
  | "order.confirmed"
  | "order.awaiting_payment"
  | "gift.activated"
  | "order.cancelled"
  | "order.failed"
  | "drop.announced"
  | "drop.reminder"
  | "farmstand.purchased";

/** Business name for emails/texts, or "" if the owner turned that off in Admin → Site. */
async function businessName() {
  const site = await getSiteSettings();
  return isOn(site.SITE_NAME_IN_NOTIFICATIONS) ? site.SITE_NAME : "";
}

/** Prisma include for the order items that notificationItems() reads. */
export const itemsWithNames = {
  include: { dropProduct: { include: { product: true } }, farmstandItem: true },
} as const;

type NamedItem = {
  quantity: number;
  priceAtPurchase: number;
  selections: unknown;
  dropProduct?: { product: { name: string } } | null;
  farmstandItem?: { name: string } | null;
};

/** Order contents for emails/texts, box picks included: "Cookie Box (4 Chocolate Chip, 2 Snickerdoodle)". */
export function notificationItems(items: NamedItem[]) {
  return items.map((i) => {
    const name = i.dropProduct?.product.name ?? i.farmstandItem?.name ?? "Item";
    const picks = describePicks(i.selections);
    return { name: picks ? `${name} (${picks})` : name, quantity: i.quantity, price: i.priceAtPurchase };
  });
}

export async function fireNotification(
  event: NotificationEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const baseUrl = await getSetting("N8N_WEBHOOK_BASE_URL");
  if (!baseUrl) return;

  const secret = await getSetting("N8N_WEBHOOK_SECRET");
  const url = `${baseUrl}/${event}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-webhook-secret": secret } : {}),
      },
      body: JSON.stringify({ event, businessName: await businessName(), ...payload }),
      // Don't block the response waiting on n8n
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.error(`[n8n] Webhook ${event} returned ${res.status}`);
    }
  } catch (err) {
    // Never throw — notification failure should not break the order flow
    console.error(`[n8n] Failed to fire ${event}:`, err);
  }
}
