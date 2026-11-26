import { getSetting } from "@/lib/settings";
import { getSiteSettings, isOn } from "@/lib/site";
import { describePicks } from "@/lib/box";
import { describeAddOns } from "@/lib/addons";
import { isOptedOut } from "@/lib/sms-opt-out";
import { textFor } from "@/lib/copy";

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
  | "farmstand.purchased"
  | "review.requested"
  | "review.thanks"
  | "sms.send"
  | "broadcast"; // a one-off text/email to a list (e.g. Porch Pickup open hours)

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
  addOns?: unknown;
  dropProduct?: { product: { name: string } } | null;
  farmstandItem?: { name: string } | null;
  name?: string | null; // kept for Porch Pickup items deleted since
};

/** Order contents for emails/texts, box picks included: "Cookie Box (4 Chocolate Chip, 2 Snickerdoodle)". */
export function notificationItems(items: NamedItem[]) {
  return items.map((i) => {
    const name = i.dropProduct?.product.name ?? i.farmstandItem?.name ?? i.name ?? "Item";
    const details = [describePicks(i.selections), describeAddOns(i.addOns)].filter(Boolean).join("; ");
    return { name: details ? `${name} (${details})` : name, quantity: i.quantity, price: i.priceAtPurchase };
  });
}

/** "Made For Sunday: Thanks Erin! Order #BBFFCB is confirmed ($24.00). Pickup: … Reply STOP to opt out." */
async function confirmationText(p: Record<string, unknown>) {
  const site = await getSiteSettings();
  const shop = isOn(site.SITE_NAME_IN_NOTIFICATIONS) ? site.SITE_NAME : "";
  const when = String(p.pickupTime || p.pickupSlot || "");
  const where = String(p.pickupAddress || p.pickupLocation || "").replace(/\n/g, ", ");
  const pickup = p.type === "DROP" && when ? `Pickup: ${when}.${where ? ` ${where}` : ""}` : "";
  const body = textFor(site)("sms.orderConfirmed", {
    name: String(p.customerName ?? "").trim().split(/\s+/)[0] || "there",
    order: String(p.orderId ?? "").slice(-6).toUpperCase(),
    total: `$${(Number(p.total ?? 0) / 100).toFixed(2)}`,
    pickup,
  });
  return `${shop ? `${shop}: ` : ""}${body.replace(/\s+/g, " ").trim()} Reply STOP to opt out.`;
}

export async function fireNotification(
  event: NotificationEvent,
  payload: Record<string, unknown>
): Promise<boolean> {
  const baseUrl = await getSetting("N8N_WEBHOOK_BASE_URL");
  if (!baseUrl) return false;

  const secret = await getSetting("N8N_WEBHOOK_SECRET");
  const url = `${baseUrl}/${event}`;
  // n8n only texts a customer when this is true (they haven't replied STOP)
  if (payload.customerPhone) payload = { ...payload, customerCanText: !(await isOptedOut(String(payload.customerPhone))) };
  // The confirmation text, in the owner's wording (Admin → Site → Text & buttons)
  if ((event === "order.confirmed" || event === "farmstand.purchased") && payload.customerPhone) payload = { ...payload, customerSms: await confirmationText(payload) };

  const body = JSON.stringify({ event, businessName: await businessName(), ...payload });
  // n8n can be briefly unavailable (restarting, or the workflow being re-published): try 3 times
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "x-webhook-secret": secret } : {}),
        },
        body,
        // Don't block the response waiting on n8n
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return true; // n8n took it
      console.error(`[n8n] Webhook ${event} returned ${res.status} (attempt ${attempt})`);
    } catch (err) {
      // Never throw — notification failure should not break the order flow
      console.error(`[n8n] Failed to fire ${event} (attempt ${attempt}):`, err);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  return false;
}
