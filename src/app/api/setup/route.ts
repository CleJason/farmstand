import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAppConfigured } from "@/lib/auth-helpers";
import { normalizeHandle } from "@/lib/settings";
import { getAdminEmails, isAdminEmail } from "@/lib/admin-emails";

export async function POST(req: Request) {
  // Only allow setup once
  const configured = await isAppConfigured();
  if (configured) {
    return NextResponse.json({ error: "App is already configured." }, { status: 403 });
  }

  const body = await req.json();
  const {
    adminEmail,
    adminName,
    businessName,
    appUrl,
    stripeSecret,
    stripePublishable,
    stripeWebhook,
    paypalUsername,
    venmoUsername,
    n8nUrl,
    n8nSecret,
  } = body;

  // Stripe is optional (Venmo/PayPal-only shops); keys can be added later in admin
  if (!adminEmail || !adminName || !appUrl) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // Only the email(s) the server owner put in ADMIN_EMAIL can become admin
  if (getAdminEmails().length === 0) {
    return NextResponse.json(
      {
        error:
          "No admin email is set on the server. Add ADMIN_EMAIL to the container settings, restart it, then try again.",
      },
      { status: 403 }
    );
  }
  if (!isAdminEmail(adminEmail)) {
    return NextResponse.json(
      { error: "That isn't the admin email for this site. Use the email set as ADMIN_EMAIL in the container settings." },
      { status: 403 }
    );
  }
  const email = String(adminEmail).trim().toLowerCase();

  try {
    // 1. Create admin user
    await prisma.user.upsert({
      where: { email },
      update: { role: "ADMIN", name: adminName },
      create: {
        email,
        name: adminName,
        role: "ADMIN",
      },
    });

    // 2. Save settings to DB (runtime-accessible config)
    const settings = [
      { key: "APP_URL", value: appUrl },
      ...(businessName?.trim()
        ? [
            { key: "SITE_NAME", value: businessName.trim() },
            { key: "SITE_HEADLINE", value: businessName.trim() },
          ]
        : []),
      { key: "STRIPE_SECRET_KEY", value: stripeSecret ?? "" },
      { key: "STRIPE_PUBLISHABLE_KEY", value: stripePublishable ?? "" },
      { key: "STRIPE_WEBHOOK_SECRET", value: stripeWebhook ?? "" },
      { key: "PAYPAL_ME_USERNAME", value: normalizeHandle(paypalUsername ?? "") },
      { key: "VENMO_USERNAME", value: normalizeHandle(venmoUsername ?? "") },
      { key: "N8N_WEBHOOK_BASE_URL", value: n8nUrl ?? "" },
      { key: "N8N_WEBHOOK_SECRET", value: n8nSecret ?? "" },
    ];

    for (const s of settings) {
      await prisma.setting.upsert({
        where: { key: s.key },
        update: { value: s.value },
        create: s,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[setup] Error:", err);
    return NextResponse.json({ error: "Setup failed. Check server logs." }, { status: 500 });
  }
}
