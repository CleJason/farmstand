import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { loadCosts } from "@/lib/costs-data";
import { suggestGramsPerCup } from "@/lib/costs";
import { baseUnit, cleanName, CostInputError, nonNegative, positive } from "@/lib/costs-input";

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const bad = (e: unknown) =>
  NextResponse.json({ error: e instanceof CostInputError ? e.message : "Couldn't save that" }, { status: 400 });

async function nameTaken(name: string, exceptId?: string) {
  const all = await prisma.ingredient.findMany({ select: { id: true, name: true } });
  return all.some((i) => i.id !== exceptId && i.name.toLowerCase() === name.toLowerCase());
}

/** Add an ingredient or packaging item: `name`, `baseUnit` (g | ml | pc), optional `gramsPerCup`, `manualCost` ($/unit). */
export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  try {
    const data = await req.json().catch(() => ({}));
    const name = cleanName(data.name);
    if (await nameTaken(name)) throw new CostInputError(`"${name}" is already on the list`);
    const unit = baseUnit(data.baseUnit);
    await prisma.ingredient.create({
      data: {
        name,
        baseUnit: unit,
        gramsPerCup: unit === "pc" ? null : positive(data.gramsPerCup, "Grams per cup", true) ?? suggestGramsPerCup(name),
        manualCost: data.manualCost === "" || data.manualCost == null ? null : nonNegative(data.manualCost, "Cost"),
      },
    });
    return NextResponse.json(await loadCosts());
  } catch (e) {
    return bad(e);
  }
}

/**
 * Change an ingredient (`id` plus any of `name`, `baseUnit`, `gramsPerCup`,
 * `manualCost`), or with `mergeInto` fold it into another one: its purchases
 * and recipe lines move over and it's removed (for "Sugar" vs "Granulated Sugar").
 */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  try {
    const data = await req.json().catch(() => ({}));
    const id = String(data.id ?? "");
    const current = await prisma.ingredient.findUnique({ where: { id }, include: { _count: { select: { purchases: true } } } });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (data.mergeInto) {
      const target = await prisma.ingredient.findUnique({ where: { id: String(data.mergeInto) } });
      if (!target || target.id === id) throw new CostInputError("Pick a different ingredient to merge into");
      // Purchases are stored in the base unit, so those only merge into the same kind; recipe lines keep their own units
      if (target.baseUnit !== current.baseUnit && current._count.purchases) {
        throw new CostInputError(`They're tracked differently (${current.baseUnit} vs ${target.baseUnit}), so their purchases can't be merged`);
      }
      await prisma.$transaction([
        prisma.ingredientPurchase.updateMany({ where: { ingredientId: id }, data: { ingredientId: target.id } }),
        prisma.recipeLine.updateMany({ where: { ingredientId: id }, data: { ingredientId: target.id } }),
        prisma.ingredient.delete({ where: { id } }),
      ]);
      return NextResponse.json(await loadCosts());
    }

    const update: Record<string, unknown> = {};
    if (data.name !== undefined) {
      const name = cleanName(data.name);
      if (await nameTaken(name, id)) throw new CostInputError(`"${name}" is already on the list`);
      update.name = name;
    }
    if (data.baseUnit !== undefined && baseUnit(data.baseUnit) !== current.baseUnit) {
      if (current._count.purchases) {
        throw new CostInputError("It already has purchases in that unit. Add a new ingredient instead, or delete its purchases first.");
      }
      update.baseUnit = baseUnit(data.baseUnit);
      // Now weighed or poured: cups and spoons need grams per cup
      if (update.baseUnit !== "pc" && current.gramsPerCup == null && data.gramsPerCup === undefined) {
        update.gramsPerCup = suggestGramsPerCup(current.name);
      }
    }
    if (data.gramsPerCup !== undefined) update.gramsPerCup = positive(data.gramsPerCup, "Grams per cup", true);
    if (data.manualCost !== undefined) {
      update.manualCost = data.manualCost === "" || data.manualCost === null ? null : nonNegative(data.manualCost, "Cost");
    }
    await prisma.ingredient.update({ where: { id }, data: update });
    return NextResponse.json(await loadCosts());
  } catch (e) {
    return bad(e);
  }
}

/** Remove an ingredient (?id=) and its purchases. Not while a recipe uses it. */
export async function DELETE(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const used = await prisma.recipeLine.count({ where: { ingredientId: id } });
  if (used) {
    return NextResponse.json(
      { error: `It's used in ${used} recipe line${used === 1 ? "" : "s"}. Take it out of those recipes, or merge it into another ingredient.` },
      { status: 400 }
    );
  }
  await prisma.ingredient.deleteMany({ where: { id } });
  return NextResponse.json(await loadCosts());
}
