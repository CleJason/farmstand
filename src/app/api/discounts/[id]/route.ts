import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { InputError, isAdmin, parseDiscount } from "@/lib/admin-input";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  try {
    // Just toggling on/off, or a full edit
    const data =
      Object.keys(body).length === 1 && "active" in body ? { active: Boolean(body.active) } : parseDiscount(body);
    const code = await prisma.discountCode.update({ where: { id }, data });
    return NextResponse.json(code);
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "That code already exists" }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  // Orders keep the code text they used, so deleting the code doesn't change history
  await prisma.discountCode.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
