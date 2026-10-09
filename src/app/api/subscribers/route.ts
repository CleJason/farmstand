import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

async function isAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

/** The drop-alert list, for the admin only. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const subscribers = await prisma.subscriber.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, phone: true, createdAt: true },
  });
  return NextResponse.json(subscribers);
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await prisma.subscriber.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
