/**
 * Mix & match boxes: a product with a box size and a list of options
 * (e.g. a 6-cookie box from 4 flavors). The customer splits the box size
 * across the options however they like; each box in the cart is its own line.
 */

export type BoxPick = { name: string; quantity: number };

/**
 * A box in sections, e.g. a bundle of "Cinnamon Rolls" (4, all one flavor) and
 * "Banana Bread" (4, any mix). The product's boxSize and boxOptions stay the
 * total and the full list, so everything else treats it like any other box.
 */
export type BoxGroup = { label: string; size: number; options: string[]; allSame: boolean };

export type BoxProduct = { name: string; boxSize: number | null; boxOptions: string[]; boxGroups?: unknown };

export const MAX_BOX_SIZE = 100;
const MAX_OPTIONS = 50;

export function isBox(p: { boxSize: number | null; boxOptions?: string[] | null }): boolean {
  return !!p.boxSize && p.boxSize > 0 && (p.boxOptions?.length ?? 0) > 0;
}

/**
 * The choices offered in one drop: the drop's own picks from the product's
 * list, or the whole list when the drop doesn't narrow it (or none still exist).
 */
export function dropBoxOptions(productOptions: string[], dropOptions: string[] | null | undefined): string[] {
  const narrowed = productOptions.filter((o) => dropOptions?.includes(o));
  return narrowed.length > 0 ? narrowed : productOptions;
}

/** A product's sections (saved as JSON), or none for a plain box. */
export function productBoxGroups(input: unknown): BoxGroup[] {
  return Array.isArray(input) ? (input as BoxGroup[]) : [];
}

/** The sections offered in one drop; a section the drop would leave empty keeps all its choices. */
export function dropBoxGroups(groups: unknown, dropOptions: string[] | null | undefined): BoxGroup[] {
  return productBoxGroups(groups).map((g) => ({ ...g, options: dropBoxOptions(g.options, dropOptions) }));
}

/**
 * Admin input for sections. An option can only be in one section, since picks
 * are saved by name. Returns [] when there's nothing usable or it's too big.
 */
export function cleanBoxGroups(input: unknown): BoxGroup[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const groups: BoxGroup[] = [];
  for (const raw of input) {
    const size = Number(raw?.size);
    const options = cleanBoxOptions(raw?.options).filter((o) => !seen.has(o.toLowerCase()));
    if (!Number.isInteger(size) || size < 1 || options.length === 0) continue;
    options.forEach((o) => seen.add(o.toLowerCase()));
    groups.push({ label: String(raw?.label ?? "").trim().slice(0, 80), size, options, allSame: !!raw?.allSame });
  }
  return groups.reduce((sum, g) => sum + g.size, 0) <= MAX_BOX_SIZE ? groups : [];
}

/** Admin input: one option per line (or an array), trimmed and de-duplicated. */
export function cleanBoxOptions(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split("\n") : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    const name = String(v ?? "").trim().slice(0, 80);
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out.slice(0, MAX_OPTIONS);
}

/** Admin input for the box size: a whole number 1–100, or null for a normal product. */
export function cleanBoxSize(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = Number(input);
  return Number.isInteger(n) && n > 0 && n <= MAX_BOX_SIZE ? n : null;
}

/**
 * Check a customer's picks for one box: known options, whole numbers, adding
 * up to exactly the box size (and each section's size, with one flavor where a
 * section is all the same). Returns them in the product's option order.
 * Throws an Error with a customer-facing message.
 */
export function validatePicks(product: BoxProduct, raw: unknown): BoxPick[] {
  if (!isBox(product)) throw new Error(`${product.name} can't be customized`);
  if (!Array.isArray(raw)) throw new Error(`Please choose what goes in your ${product.name}`);
  const groups = productBoxGroups(product.boxGroups);
  const allowed = groups.length ? groups.flatMap((g) => g.options) : product.boxOptions;
  const counts = new Map<string, number>();
  for (const pick of raw) {
    const name = String(pick?.name ?? "");
    const quantity = Number(pick?.quantity);
    if (!allowed.includes(name)) {
      throw new Error(`"${name}" isn't an option for ${product.name} anymore — please rebuild that box`);
    }
    if (!Number.isInteger(quantity) || quantity < 0) throw new Error("Invalid box selection");
    counts.set(name, (counts.get(name) ?? 0) + quantity);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total !== product.boxSize) {
    throw new Error(`Each ${product.name} needs exactly ${product.boxSize} picks (you chose ${total})`);
  }
  for (const g of groups) {
    const picked = g.options.filter((o) => (counts.get(o) ?? 0) > 0);
    const inGroup = picked.reduce((sum, o) => sum + counts.get(o)!, 0);
    if (inGroup !== g.size) {
      throw new Error(`${product.name} needs exactly ${g.size} ${g.label || "picks"} (you chose ${inGroup})`);
    }
    if (g.allSame && picked.length > 1) {
      throw new Error(`${product.name}: please choose one flavor for ${g.label || "that section"}`);
    }
  }
  return allowed
    .filter((name) => (counts.get(name) ?? 0) > 0)
    .map((name) => ({ name, quantity: counts.get(name)! }));
}

/** Same picks in the same order → same key, so identical boxes share a cart line. */
export function picksKey(picks: BoxPick[] | null | undefined): string {
  if (!picks?.length) return "";
  return [...picks]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => `${p.quantity}x${p.name}`)
    .join("|");
}

/** "3 Chocolate Chip, 3 Snickerdoodle" */
export function describePicks(picks: unknown): string {
  if (!Array.isArray(picks)) return "";
  return picks
    .filter((p) => p && typeof p.name === "string" && Number(p.quantity) > 0)
    .map((p) => `${p.quantity} ${p.name}`)
    .join(", ");
}
