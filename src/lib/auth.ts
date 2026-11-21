import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Nodemailer from "next-auth/providers/nodemailer";
import { prisma } from "@/lib/prisma";
import { getAdminEmails, isAdminEmail } from "@/lib/admin-emails";
import { CODE_MINUTES, newLoginCode } from "@/lib/login-code";
import { getSetting } from "@/lib/settings";
import { createTransport } from "nodemailer";

// SQLite has no enums; User.role is a String column holding one of these.
export type Role = "ADMIN" | "CUSTOMER";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: Role;
    };
  }
}

// Sign-in email (SMTP) settings: Admin → Settings → Email first, env vars as fallback
export const SMTP_KEYS = [
  "EMAIL_SERVER_HOST",
  "EMAIL_SERVER_PORT",
  "EMAIL_SERVER_USER",
  "EMAIL_SERVER_PASS",
  "EMAIL_FROM",
] as const;

export async function getSmtpSettings(): Promise<Record<(typeof SMTP_KEYS)[number], string>> {
  const values = Object.fromEntries(SMTP_KEYS.map((k) => [k, process.env[k] ?? ""])) as Record<
    (typeof SMTP_KEYS)[number],
    string
  >;
  try {
    const rows = await prisma.setting.findMany({ where: { key: { in: [...SMTP_KEYS] } } });
    for (const r of rows) if (r.value) values[r.key as (typeof SMTP_KEYS)[number]] = r.value;
  } catch {
    // DB not ready — env values only
  }
  return values;
}

/**
 * Sign-in links follow the Website address from Admin → Settings, so a
 * container still set up with a home-network NEXTAUTH_URL (e.g. from first
 * testing) doesn't email links nobody outside the house can open. Auth.js
 * reads AUTH_URL on every request, after this config is built.
 */
async function applyWebsiteAddress() {
  try {
    const row = await prisma.setting.findUnique({ where: { key: "APP_URL" } });
    const url = row?.value ? new URL(row.value) : null;
    if (url && (url.protocol === "https:" || url.protocol === "http:")) process.env.AUTH_URL = url.origin;
  } catch {
    // DB not ready or not a URL: keep the env setting
  }
}

// Config is built per request so SMTP changes in admin apply without a restart
export const { handlers, signIn, signOut, auth } = NextAuth(async () => {
  const [smtp] = await Promise.all([getSmtpSettings(), applyWebsiteAddress()]);
  const port = Number(smtp.EMAIL_SERVER_PORT) || 465;

  return {
    // No hardcoded fallback: a secret in source would let anyone forge sessions.
    // Auth.js errors at runtime if neither is set.
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    adapter: PrismaAdapter(prisma),
    providers: [
      Nodemailer({
        server: {
          host: smtp.EMAIL_SERVER_HOST,
          port,
          auth: { user: smtp.EMAIL_SERVER_USER, pass: smtp.EMAIL_SERVER_PASS },
          secure: port === 465,
        },
        from: smtp.EMAIL_FROM || smtp.EMAIL_SERVER_USER || "noreply@example.com",
        maxAge: CODE_MINUTES * 60,
        // 6-digit code: the email's link still works, and the code can be typed in instead
        generateVerificationToken: newLoginCode,
        sendVerificationRequest: sendSignInEmail,
      }),
    ],
    callbacks: {
      async session({ session, user }) {
        if (session.user && user) {
          session.user.id = user.id;
          // Fetch role from DB
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { role: true },
          });
          let role = (dbUser?.role as Role) ?? "CUSTOMER";
          // When admin emails are configured (ADMIN_EMAIL / ADMIN_EMAIL_2), they are
          // the only admins: listed emails are promoted, anyone removed is demoted.
          if (getAdminEmails().length > 0) {
            const shouldBe: Role = isAdminEmail(session.user.email) ? "ADMIN" : "CUSTOMER";
            if (role !== shouldBe) {
              await prisma.user.update({ where: { id: user.id }, data: { role: shouldBe } });
              role = shouldBe;
            }
          }
          session.user.role = role;
        }
        return session;
      },
    },
    pages: {
      signIn: "/login",
      verifyRequest: "/login/verify",
      error: "/login/error",
    },
  };
});

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Sign-in email with both a button and the 6-digit code. */
async function sendSignInEmail({
  identifier,
  url,
  token,
  provider,
}: {
  identifier: string;
  url: string;
  token: string;
  provider: { server?: unknown; from?: string };
}) {
  const shop = (await getSetting("SITE_NAME")) || new URL(url).host;
  const color = (await getSetting("SITE_BRAND_COLOR")) || "#d97706";
  const textColor = (await getSetting("SITE_BUTTON_TEXT_COLOR")) || "#ffffff";
  const code = `${token.slice(0, 3)} ${token.slice(3)}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transport = createTransport(provider.server as any);
  const result = await transport.sendMail({
    to: identifier,
    from: provider.from,
    subject: `${token} is your ${shop} sign-in code`,
    text: `Sign in to ${shop}\n\nYour code: ${code}\n\nOr open this link:\n${url}\n\nThe code and link expire in ${CODE_MINUTES} minutes. If you didn't ask for this, you can ignore this email.\n`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1c1917;text-align:center">
<h2 style="margin:0 0 16px">Sign in to ${esc(shop)}</h2>
<p style="margin:0 0 8px;color:#57534e">Your sign-in code</p>
<p style="margin:0 0 24px;font-size:34px;font-weight:bold;letter-spacing:6px">${code}</p>
<p style="margin:0 0 24px"><a href="${esc(url)}" style="background:${esc(color)};color:${esc(textColor)};text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold;display:inline-block">Sign in</a></p>
<p style="margin:0;font-size:13px;color:#78716c">Type the code on the sign-in page, or tap the button. Both expire in ${CODE_MINUTES} minutes. If you didn't ask for this, ignore this email.</p>
</div>`,
  });
  const failed = result.rejected.filter(Boolean);
  if (failed.length) throw new Error(`Email (${failed.join(", ")}) could not be sent`);
}
