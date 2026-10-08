import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Nodemailer from "next-auth/providers/nodemailer";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin-emails";

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

// Config is built per request so SMTP changes in admin apply without a restart
export const { handlers, signIn, signOut, auth } = NextAuth(async () => {
  const smtp = await getSmtpSettings();
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
          // Emails listed in ADMIN_EMAIL (container settings) are always admins
          if (role !== "ADMIN" && isAdminEmail(session.user.email)) {
            await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
            role = "ADMIN";
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
