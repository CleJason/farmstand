import { formatPrice } from "@/lib/utils";

/** An order as Admin gets it from /api/orders. */
export interface Order {
  id: string;
  type: string;
  status: string;
  paymentMethod: string;
  total: number;
  discount: number;
  discountCode: string | null;
  giftCode: string | null;
  giftAmount: number;
  notes: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  manualPaymentRef: string | null;
  createdAt: string;
  reviewRequestedAt: string | null;
  reviewDueAt: string | null; // picked up: when the review request goes out
  pickupSlot: { label: string; location: string | null; pickupDate: string; endDate: string | null } | null;
  pickupTime: string | null;
  user: { name: string | null; email: string; phone: string | null } | null;
  drop: { title: string; orderCloseAt: string } | null;
  items: {
    id: string;
    quantity: number;
    priceAtPurchase: number;
    selections: unknown;
    addOns: unknown;
    dropProduct: { product: { name: string } } | null;
    farmstandItem: { name: string } | null;
    name: string | null; // a Porch Pickup item's name, kept if the item was deleted
  }[];
}

// Orders that need baking: paid ones only (unpaid Venmo/PayPal checkouts are often never paid)
export const BAKE_STATUSES = ["PAID", "READY", "PICKED_UP"];

/** When an order is picked up: the chosen time, or the window's start. */
export function pickupAt(o: Order): string | null {
  return o.pickupTime ?? o.pickupSlot?.pickupDate ?? null;
}

/** The pickup day an order is for, e.g. "Fri, Nov 6" (null for orders with no pickup). */
export function pickupDay(o: Order): string | null {
  const when = pickupAt(o);
  return when ? new Date(when).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : null;
}

export const itemName = (item: Order["items"][number]) =>
  item.dropProduct?.product.name ?? item.farmstandItem?.name ?? item.name ?? "Item";

export type BakeLine = { name: string; count: number; extras: [string, number][] };

/**
 * What to make for a set of orders: each product with how many, then under it
 * what went in its boxes and how many of each add-on ("+ Extra Icing × 1").
 */
export function bakeList(orders: Order[]): BakeLine[] {
  const lines = new Map<string, { count: number; extras: Map<string, number> }>();
  for (const o of orders) {
    if (!BAKE_STATUSES.includes(o.status)) continue;
    for (const item of o.items) {
      const name = itemName(item);
      const line = lines.get(name) ?? { count: 0, extras: new Map<string, number>() };
      line.count += item.quantity;
      const bump = (label: string, n: number) => line.extras.set(label, (line.extras.get(label) ?? 0) + n);
      if (Array.isArray(item.selections)) {
        for (const p of item.selections as { name: string; quantity: number }[]) bump(p.name, p.quantity * item.quantity);
      }
      if (Array.isArray(item.addOns)) {
        for (const a of item.addOns as { name: string }[]) bump(`+ ${a.name}`, item.quantity);
      }
      lines.set(name, line);
    }
  }
  return [...lines]
    .map(([name, l]) => ({ name, count: l.count, extras: [...l.extras].sort((a, b) => b[1] - a[1]) }))
    .sort((a, b) => b.count - a.count);
}

export const statusConfig: Record<string, { label: string; classes: string }> = {
  PAID: { label: "Paid", classes: "bg-emerald-50 text-emerald-700" },
  AWAITING_CONFIRM: { label: "Awaiting Confirm", classes: "bg-amber-50 text-amber-700" },
  READY: { label: "Ready", classes: "bg-blue-50 text-blue-700" },
  PICKED_UP: { label: "Picked Up", classes: "bg-stone-100 text-stone-600" },
  // A card checkout that hasn't been paid (yet): the shop checks with Stripe every minute
  PENDING: { label: "Card not paid (yet)", classes: "bg-stone-100 text-stone-500" },
  CANCELLED: { label: "Cancelled", classes: "bg-red-50 text-red-600" },
  REFUNDED: { label: "Refunded", classes: "bg-purple-50 text-purple-600" },
};

/** When an unpaid Venmo/PayPal order cancels itself, with the auto-cancel set to `hours` (0 = never). */
export function cancelsAt(order: Order, hours: number): Date | null {
  return hours ? new Date(new Date(order.createdAt).getTime() + hours * 3600_000) : null;
}

/** "Payment reminder" on an unpaid order: a text and email in the shop's name, editable before it goes. */
export async function remindToPay(order: Order, shop: string, unpaidHours: number) {
  const no = order.id.slice(-6).toUpperCase();
  const at = cancelsAt(order, unpaidHours);
  const until = at?.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  const method = order.paymentMethod === "PAYPAL" ? "PayPal" : order.paymentMethod === "VENMO" ? "Venmo" : "your payment method";
  const message =
    `Hi${order.guestName ? ` ${order.guestName.split(" ")[0]}` : ""}! A reminder from ${shop}: your order #${no} ` +
    `(${formatPrice(order.total)}) hasn't been paid yet${until ? ` and will be cancelled ${until} if it's still unpaid` : ""}. ` +
    `Please send it by ${method} with #${no} in the note. If you've changed your mind, no need to do anything.`;
  const edited = prompt("Send this reminder by text and email?", message);
  if (!edited) return;
  const res = await fetch(`/api/orders/${order.id}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: edited, via: "both" }),
  });
  const data = await res.json().catch(() => ({}));
  alert(res.ok ? `Sent by ${data.sent.join(" and ")}.${data.problems?.length ? ` (${data.problems.join("; ")})` : ""}` : data.error || "Couldn't send it");
}

/** Change an order's status (with `notify`, the customer hears about it). Returns false if it failed. */
export async function setOrderStatus(orderId: string, status: string, notify = true) {
  try {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, notify }),
    });
    if (res.ok) return true;
    alert((await res.json().catch(() => ({}))).error || "Failed to update status");
  } catch {
    alert("Failed to update status");
  }
  return false;
}
