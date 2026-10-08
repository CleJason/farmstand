/** Validation for the drop create/edit form payload (pickup windows and products). */

export class DropInputError extends Error {}

export type SlotInput = {
  id?: string;
  label: string;
  pickupDate: Date;
  endDate: Date | null;
  location: string | null;
  intervalMinutes: number;
  maxPerTime: number | null;
};

export type ProductInput = {
  productId: string;
  quantityLimit: number | null;
  priceOverride: number | null; // cents
};

const optionalInt = (v: unknown, min: number) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) throw new DropInputError(`Expected a whole number of at least ${min}`);
  return n;
};

const date = (v: unknown, what: string) => {
  const d = new Date(String(v));
  if (!v || Number.isNaN(d.getTime())) throw new DropInputError(`Invalid ${what}`);
  return d;
};

export function parseSlots(raw: unknown): SlotInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => {
    const pickupDate = date(s?.pickupDate, "pickup start time");
    const endDate = s?.endDate ? date(s.endDate, "pickup end time") : null;
    if (endDate && endDate < pickupDate) throw new DropInputError("A pickup window ends before it starts");
    const intervalMinutes = optionalInt(s?.intervalMinutes, 5) ?? 30;
    if (intervalMinutes > 240) throw new DropInputError("Pickup interval is too long");
    return {
      id: typeof s?.id === "string" && s.id ? s.id : undefined,
      label: String(s?.label || "").trim() || pickupDate.toISOString(),
      pickupDate,
      endDate,
      location: String(s?.location || "").trim() || null,
      intervalMinutes,
      maxPerTime: optionalInt(s?.maxPerTime, 1),
    };
  });
}

export function parseProducts(raw: unknown): ProductInput[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.map((p) => {
    const productId = String(p?.productId || "");
    if (!productId || seen.has(productId)) throw new DropInputError("Invalid or duplicate product");
    seen.add(productId);
    return {
      productId,
      quantityLimit: optionalInt(p?.quantityLimit, 0),
      priceOverride: optionalInt(p?.priceOverride, 0),
    };
  });
}
