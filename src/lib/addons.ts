/**
 * Product add-ons: optional extras a customer can tick (e.g. "Extra icing",
 * +$1.00 per item). Each combination of add-ons is its own cart line.
 */

export type AddOn = { name: string; price: number }; // price in cents, per item

const MAX_ADD_ONS = 20;

/** The add-ons stored on a product (JSON), cleaned up. */
export function productAddOns(value: unknown): AddOn[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((a) => ({ name: String(a?.name ?? "").trim().slice(0, 60), price: Math.round(Number(a?.price)) }))
    .filter((a) => a.name && Number.isInteger(a.price) && a.price >= 0)
    .slice(0, MAX_ADD_ONS);
}

/** Admin input → add-on list (no duplicate names). */
export function cleanAddOns(input: unknown): AddOn[] {
  const seen = new Set<string>();
  return productAddOns(input).filter((a) => !seen.has(a.name.toLowerCase()) && !!seen.add(a.name.toLowerCase()));
}

/**
 * The add-ons a customer chose, checked against the product (names only come
 * from the browser; prices come from the product). Throws with a message.
 */
export function chosenAddOns(productName: string, offered: AddOn[], raw: unknown): AddOn[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error("Invalid add-ons");
  const names = [...new Set(raw.map(String))];
  return names.map((n) => {
    const a = offered.find((o) => o.name === n);
    if (!a) throw new Error(`"${n}" isn't available for ${productName} anymore`);
    return a;
  });
}

export const addOnsTotal = (list: AddOn[] | null | undefined) => (list ?? []).reduce((s, a) => s + a.price, 0);

/** Same add-ons in any order → same key, so identical choices share a cart line. */
export const addOnsKey = (names: string[] | null | undefined) => [...(names ?? [])].sort().join("|");

/** "+ Extra icing, + Pecans" */
export function describeAddOns(value: unknown): string {
  return productAddOns(value)
    .map((a) => `+ ${a.name}`)
    .join(", ");
}
