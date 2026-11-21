import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Sign-in codes. The emailed sign-in token is a 6-digit code, so it works
 * both as the link in the email and typed into the login page (handy in the
 * Android app, where an emailed link opens in the browser instead).
 * Wrong guesses are capped per email so the short code can't be brute-forced.
 */
export const CODE_MINUTES = 60;
const MAX_FAILS = 5;
// On globalThis so every route shares one count (route bundles can each load this module)
const g = globalThis as unknown as { __loginCodeFails?: Map<string, { count: number; since: number }> };
const failures = (g.__loginCodeFails ??= new Map());

const secret = () => process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
const hashCode = (code: string) => createHash("sha256").update(`${code}${secret()}`).digest("hex");

export function normalizeEmail(email: string) {
  const e = email.normalize("NFKC").toLowerCase().trim();
  const [local, domain = ""] = e.split("@");
  return `${local}@${domain.split(",")[0]}`;
}

/** New 6-digit code; tidies up expired ones and avoids clashing with a live one. */
export async function newLoginCode(): Promise<string> {
  await prisma.verificationToken.deleteMany({ where: { expires: { lt: new Date() } } }).catch(() => {});
  for (let i = 0; i < 10; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const taken = await prisma.verificationToken.findUnique({ where: { token: hashCode(code) } }).catch(() => null);
    if (!taken) return code;
  }
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type CodeCheck = "ok" | "wrong" | "expired" | "locked";

/** Checks a code without using it up. Counts wrong guesses; too many cancels the email's codes. */
export async function checkLoginCode(rawEmail: string, rawCode: string): Promise<CodeCheck> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\s/g, "");
  const now = Date.now();
  const f = failures.get(email);
  if (f && now - f.since > CODE_MINUTES * 60_000) failures.delete(email);
  if ((failures.get(email)?.count ?? 0) >= MAX_FAILS) return "locked";

  const row = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token: hashCode(code) } },
  });
  if (row && row.expires.getTime() >= now) {
    failures.delete(email);
    return "ok";
  }
  if (row) return "expired";

  const next = { count: (failures.get(email)?.count ?? 0) + 1, since: failures.get(email)?.since ?? now };
  failures.set(email, next);
  if (next.count >= MAX_FAILS) {
    await prisma.verificationToken.deleteMany({ where: { identifier: email } }).catch(() => {});
    return "locked";
  }
  return "wrong";
}
