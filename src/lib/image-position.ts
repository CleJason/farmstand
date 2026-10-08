/** Where a photo sits inside its square frame, as CSS object-position ("x% y%"). */

export const DEFAULT_POSITION = "50% 50%";

const PATTERN = /^(\d{1,3}(?:\.\d+)?)% (\d{1,3}(?:\.\d+)?)%$/;

export function parsePosition(value: string | null | undefined): { x: number; y: number } {
  const m = PATTERN.exec(value ?? "");
  if (!m) return { x: 50, y: 50 };
  return { x: Math.min(100, Number(m[1])), y: Math.min(100, Number(m[2])) };
}

export function formatPosition(x: number, y: number) {
  const clamp = (n: number) => Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;
  return `${clamp(x)}% ${clamp(y)}%`;
}

/** Accept a position from the browser, or null to reset to centered. */
export function cleanPosition(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return PATTERN.test(String(value)) ? String(value) : null;
}
