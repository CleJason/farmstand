import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getSetting, normalizeHandle } from "@/lib/settings";

// Secrets are never sent back to the browser; only whether they're set, plus a hint.
const SECRET_KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "N8N_WEBHOOK_SECRET"] as const;
const PLAIN_KEYS = [
  "STRIPE_PUBLISHABLE_KEY",
  "PAYPAL_ME_USERNAME",
  "VENMO_USERNAME",
  "N8N_WEBHOOK_BASE_URL",
] as const;

async function requireAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

function mask(value: string) {
  return value ? `••••${value.slice(-4)}` : "";
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plain = Object.fromEntries(
    await Promise.all(PLAIN_KEYS.map(async (k) => [k, await getSetting(k)] as const))
  );
  const secrets = Object.fromEntries(
    await Promise.all(SECRET_KEYS.map(async (k) => [k, mask(await getSetting(k))] as const))
  );
  const appUrl = await getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || "");

  return NextResponse.json({
    ...plain,
    secrets,
    stripeWebhookUrl: `${appUrl.replace(/\/+$/, "")}/api/payments/stripe/webhook`,
  });
}

/**
 * Plain values are saved as sent (empty clears them). Secrets are only
 * overwritten when a new non-empty value is entered.
 */
export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const updates: { key: string; value: string }[] = [];

  for (const key of PLAIN_KEYS) {
    if (typeof body[key] !== "string") continue;
    const value = key === "PAYPAL_ME_USERNAME" || key === "VENMO_USERNAME"
      ? normalizeHandle(body[key])
      : body[key].trim();
    updates.push({ key, value });
  }
  for (const key of SECRET_KEYS) {
    if (typeof body[key] === "string" && body[key].trim()) {
      updates.push({ key, value: body[key].trim() });
    }
  }

  const secret = updates.find((u) => u.key === "STRIPE_SECRET_KEY")?.value;
  if (secret && !/^(sk|rk)_(test|live)_/.test(secret)) {
    return NextResponse.json({ error: "Stripe secret key should start with sk_test_ or sk_live_" }, { status: 400 });
  }
  const publishable = updates.find((u) => u.key === "STRIPE_PUBLISHABLE_KEY")?.value;
  if (publishable && !/^pk_(test|live)_/.test(publishable)) {
    return NextResponse.json({ error: "Stripe publishable key should start with pk_test_ or pk_live_" }, { status: 400 });
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.setting.upsert({ where: { key: u.key }, update: { value: u.value }, create: u })
    )
  );

  return NextResponse.json({ ok: true });
}
