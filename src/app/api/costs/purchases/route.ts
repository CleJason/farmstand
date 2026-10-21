import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { loadCosts } from "@/lib/costs-data";
import { baseUnitFor, toBase } from "@/lib/costs";
import { cents, cleanName, CostInputError, day, positive, unit } from "@/lib/costs-input";

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const bad = (e: unknown) =>
  NextResponse.json({ error: e instanceof CostInputError ? e.message : "Couldn't save that" }, { status: 400 });

/**
 * A purchase as typed: `ingredientId` (or a new `ingredientName`), `date`,
 * `store`, `quantity` + `unit` (lb, kg, oz, qt…; stored in the ingredient's
 * base unit) and `price` in dollars.
 */
async function parse(data: Record<string, unknown>) {
  const u = unit(data.unit);
  let ingredient = data.ingredientId ? await prisma.ingredient.findUnique({ where: { id: String(data.ingredientId) } }) : null;
  if (!ingredient) {
    const name = cleanName(data.ingredientName, "what you bought");
    const all = await prisma.ingredient.findMany();
    ingredient =
      all.find((i) => i.name.toLowerCase() === name.toLowerCase()) ??
      (await prisma.ingredient.create({ data: { name, baseUnit: baseUnitFor(u) } }));
  }
  const qty = positive(data.quantity, "Amount")!;
  const base = toBase(qty, u, ingredient);
  if (base.error) throw new CostInputError(`${ingredient.name} is tracked in ${ingredient.baseUnit}: can't buy it in ${u}`);
  return {
    ingredientId: ingredient.id,
    date: day(data.date),
    store: String(data.store ?? "").trim().slice(0, 60) || null,
    quantity: base.amount,
    price: cents(data.price, "Price")!,
  };
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  try {
    await prisma.ingredientPurchase.create({ data: await parse(await req.json().catch(() => ({}))) });
    return NextResponse.json(await loadCosts());
  } catch (e) {
    return bad(e);
  }
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  try {
    const data = await req.json().catch(() => ({}));
    const { count } = await prisma.ingredientPurchase.updateMany({ where: { id: String(data.id ?? "") }, data: await parse(data) });
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(await loadCosts());
  } catch (e) {
    return bad(e);
  }
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  await prisma.ingredientPurchase.deleteMany({ where: { id: new URL(req.url).searchParams.get("id") ?? "" } });
  return NextResponse.json(await loadCosts());
}
