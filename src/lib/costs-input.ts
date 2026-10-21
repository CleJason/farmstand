import { normalizeUnit, type BaseUnit } from "@/lib/costs";

export class CostInputError extends Error {}

const BASE_UNITS: BaseUnit[] = ["g", "ml", "pc"];

export function cleanName(v: unknown, what = "a name"): string {
  const name = String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (!name) throw new CostInputError(`Add ${what}`);
  return name;
}

export function baseUnit(v: unknown): BaseUnit {
  return BASE_UNITS.includes(v as BaseUnit) ? (v as BaseUnit) : "g";
}

/** A positive number, or null when left empty (when `optional`). */
export function positive(v: unknown, what: string, optional = false): number | null {
  if (optional && (v === undefined || v === null || v === "")) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new CostInputError(`${what} should be a number above 0`);
  return n;
}

export function nonNegative(v: unknown, what: string): number {
  const n = v === undefined || v === null || v === "" ? 0 : Number(v);
  if (!Number.isFinite(n) || n < 0) throw new CostInputError(`${what} should be 0 or more`);
  return n;
}

/** Dollars (as typed) → cents. */
export function cents(v: unknown, what: string, optional = false): number | null {
  if (optional && (v === undefined || v === null || v === "")) return null;
  const n = Number(String(v).replace(/[$,]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new CostInputError(`${what} should be a dollar amount`);
  return Math.round(n * 100);
}

export function unit(v: unknown): string {
  const u = normalizeUnit(String(v ?? ""));
  if (!u) throw new CostInputError(`Unknown unit "${String(v ?? "")}"`);
  return u;
}

export function day(v: unknown): Date {
  const s = String(v ?? "");
  // "2026-10-20" from a date box: noon UTC, so it shows as that day in US timezones
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00Z` : s);
  if (Number.isNaN(d.getTime())) throw new CostInputError("Pick a date");
  return d;
}
