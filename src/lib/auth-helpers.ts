import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";

/** Get current session or redirect to login */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

/** Get current session or redirect to login, AND require ADMIN role */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/");
  }
  return session;
}

/** Check if app has been set up (admin user exists) */
export async function isAppConfigured(): Promise<boolean> {
  // Request-time only; never query the database while building pages
  await connection();
  try {
    const { prisma } = await import("@/lib/prisma");
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    return !!admin;
  } catch {
    return false;
  }
}
