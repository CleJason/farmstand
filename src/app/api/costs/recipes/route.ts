import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { loadCosts } from "@/lib/costs-data";
import { cents, cleanName, CostInputError, nonNegative, positive, unit } from "@/lib/costs-input";

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const bad = (e: unknown) =>
  NextResponse.json({ error: e instanceof CostInputError ? e.message : "Couldn't save that" }, { status: 400 });

/**
 * Save a recipe (new, or `id` to change one): `name`, `yieldCount`,
 * `yieldLabel`, `overheadHours`, `sellPrice` ($) + `sellPer` (batch | item),
 * `notes`, and `lines` [{ ingredientId, quantity, unit, note }] in order.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  try {
    const data = await req.json().catch(() => ({}));
    const id = data.id ? String(data.id) : null;
    const name = cleanName(data.name, "the recipe's name");
    const clash = (await prisma.recipe.findMany({ select: { id: true, name: true } })).find(
      (r) => r.id !== id && r.name.toLowerCase() === name.toLowerCase()
    );
    if (clash) throw new CostInputError(`There's already a recipe called "${clash.name}"`);

    const known = new Set((await prisma.ingredient.findMany({ select: { id: true } })).map((i) => i.id));
    const rawLines: unknown[] = Array.isArray(data.lines) ? data.lines.slice(0, 200) : [];
    const lines = rawLines.map((raw, position) => {
      const l = (raw ?? {}) as Record<string, unknown>;
      if (!known.has(String(l.ingredientId))) throw new CostInputError(`Line ${position + 1}: pick an ingredient`);
      return {
        ingredientId: String(l.ingredientId),
        quantity: positive(l.quantity, `Line ${position + 1}: amount`)!,
        unit: unit(l.unit),
        note: String(l.note ?? "").trim().slice(0, 200) || null,
        position,
      };
    });
    const fields = {
      name,
      yieldCount: positive(data.yieldCount ?? 1, "How many it makes")!,
      yieldLabel: String(data.yieldLabel ?? "").trim().slice(0, 40) || "items",
      overheadHours: nonNegative(data.overheadHours, "Hours"),
      sellPrice: cents(data.sellPrice, "Price", true),
      sellPer: data.sellPer === "item" ? "item" : "batch",
      notes: String(data.notes ?? "").trim().slice(0, 4000) || null,
    };

    if (id) {
      const exists = await prisma.recipe.findUnique({ where: { id } });
      if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
      await prisma.$transaction([
        prisma.recipeLine.deleteMany({ where: { recipeId: id } }),
        prisma.recipe.update({ where: { id }, data: { ...fields, lines: { create: lines } } }),
      ]);
    } else {
      await prisma.recipe.create({ data: { ...fields, lines: { create: lines } } });
    }
    return NextResponse.json(await loadCosts());
  } catch (e) {
    return bad(e);
  }
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  await prisma.recipe.deleteMany({ where: { id: new URL(req.url).searchParams.get("id") ?? "" } });
  return NextResponse.json(await loadCosts());
}
