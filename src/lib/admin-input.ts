import { auth } from "@/lib/auth";
import { normalizeCode } from "@/lib/discounts";

export class InputError extends Error {}

export async function isAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

const optInt = (v: unknown, min: number, what: string) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) throw new InputError(`${what} must be a whole number of at least ${min}`);
  return n;
};

/** Validate the discount form. Money values arrive in cents. */
export function parseDiscount(body: Record<string, unknown>) {
  const code = normalizeCode(body.code);
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
    throw new InputError("Code should be 2–32 letters or numbers (no spaces)");
  }
  const type = body.type === "AMOUNT" ? "AMOUNT" : "PERCENT";
  const value = optInt(body.value, 1, "Discount");
  if (value === null) throw new InputError("Enter how much the discount is");
  if (type === "PERCENT" && value > 100) throw new InputError("Percent off can't be more than 100");
  const appliesTo = ["DROP", "FARMSTAND"].includes(String(body.appliesTo)) ? String(body.appliesTo) : "ALL";
  const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new InputError("Invalid expiry date");
  return {
    code,
    type,
    value,
    appliesTo,
    minSubtotal: optInt(body.minSubtotal, 0, "Minimum order"),
    maxUses: optInt(body.maxUses, 1, "Max uses"),
    expiresAt,
    active: body.active === undefined ? true : Boolean(body.active),
    // Personal code: only these customers' emails can use it (empty = anyone)
    allowedEmails: [
      ...new Set(
        (Array.isArray(body.allowedEmails) ? body.allowedEmails : String(body.allowedEmails ?? "").split(/[\s,;]+/))
          .map((e) => String(e).trim().toLowerCase())
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      ),
    ].slice(0, 100),
  };
}

/** Validate the review form. */
export function parseReview(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim().slice(0, 100);
  const text = String(body.body ?? "").trim().slice(0, 4000);
  const rating = Number(body.rating);
  if (!name) throw new InputError("Add the reviewer's name");
  if (!text) throw new InputError("Add the review text");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new InputError("Rating must be 1 to 5 stars");
  const reviewDate = body.reviewDate ? new Date(String(body.reviewDate)) : new Date();
  if (Number.isNaN(reviewDate.getTime())) throw new InputError("Invalid review date");
  return {
    name,
    body: text,
    rating,
    source: String(body.source ?? "").trim().slice(0, 50) || null,
    products:
      String(body.products ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .join(", ")
        .slice(0, 500) || null,
    reply: String(body.reply ?? "").trim().slice(0, 4000) || null,
    // Which customer wrote it (links a review copied from Hotplate to their profile)
    ...(body.email !== undefined
      ? { email: String(body.email ?? "").trim().toLowerCase().slice(0, 254) || null }
      : {}),
    reviewDate,
    visible: body.visible === undefined ? true : Boolean(body.visible),
  };
}
