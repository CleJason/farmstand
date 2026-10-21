import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { loadCosts } from "@/lib/costs-data";
import { cents, cleanName, CostInputError, day } from "@/lib/costs-input";

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const bad = (e: unknown) =>
  NextResponse.json({ error: e instanceof CostInputError ? e.message : "Couldn't save that" }, { status: 400 });

/** A receipt as typed: `date`, `vendor`, `amount` ($), `description`, `category`, `imageUrl` (from /api/upload). */
function parse(data: Record<string, unknown>) {
  const image = String(data.imageUrl ?? "").trim();
  return {
    date: day(data.date),
    vendor: cleanName(data.vendor, "the store").slice(0, 60),
    amount: cents(data.amount, "The total")!,
    description: String(data.description ?? "").trim().slice(0, 1000) || null,
    category: String(data.category ?? "").trim().slice(0, 40) || null,
    // Only photos uploaded to this site
    imageUrl: /^\/uploads\/[\w.-]+$/.test(image) ? image : null,
  };
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  try {
    await prisma.receipt.create({ data: parse(await req.json().catch(() => ({}))) });
    return NextResponse.json(await loadCosts());
  } catch (e) {
    return bad(e);
  }
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  try {
    const data = await req.json().catch(() => ({}));
    const { count } = await prisma.receipt.updateMany({ where: { id: String(data.id ?? "") }, data: parse(data) });
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(await loadCosts());
  } catch (e) {
    return bad(e);
  }
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  await prisma.receipt.deleteMany({ where: { id: new URL(req.url).searchParams.get("id") ?? "" } });
  return NextResponse.json(await loadCosts());
}
