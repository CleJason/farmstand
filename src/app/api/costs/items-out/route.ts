import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { loadCosts } from "@/lib/costs-data";
import { CostInputError, day, positive } from "@/lib/costs-input";

const REASONS = ["giveaway", "tasting", "tossed"];

/**
 * Baked items that didn't sell: `recipeId`, `count`, `reason` (giveaway | tasting
 * | tossed), `note` (who got them). Their cost is remembered (cost per item then).
 * Ingredients aren't touched: they were used when the batch was baked.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const data = await req.json().catch(() => ({}));
    const costs = await loadCosts();
    const recipe = costs.recipes.find((r) => r.id === String(data.recipeId ?? ""));
    if (!recipe) throw new CostInputError("Pick what it was");
    const count = positive(data.count, "How many")!;
    await prisma.itemOut.create({
      data: {
        recipeId: recipe.id,
        count,
        reason: REASONS.includes(String(data.reason)) ? String(data.reason) : "giveaway",
        note: String(data.note ?? "").trim().slice(0, 300) || null,
        date: data.date ? day(data.date) : new Date(),
        cost: Math.round(recipe.cost.perItem * count * 100),
      },
    });
    return NextResponse.json(await loadCosts());
  } catch (e) {
    return NextResponse.json({ error: e instanceof CostInputError ? e.message : "Couldn't save that" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.itemOut.deleteMany({ where: { id: new URL(req.url).searchParams.get("id") ?? "" } });
  return NextResponse.json(await loadCosts());
}
