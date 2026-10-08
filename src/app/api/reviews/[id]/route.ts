import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { InputError, isAdmin, parseReview } from "@/lib/admin-input";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  try {
    // Just showing/hiding, or a full edit
    const data =
      Object.keys(body).length === 1 && "visible" in body ? { visible: Boolean(body.visible) } : parseReview(body);
    const review = await prisma.review.update({ where: { id }, data });
    return NextResponse.json(review);
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.review.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
