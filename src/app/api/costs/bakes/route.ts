import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { loadCosts } from "@/lib/costs-data";
import { batchUsage } from "@/lib/costs-plan";
import { CostInputError, day, positive } from "@/lib/costs-input";

const REASONS = ["drop", "porch", "test", "other"];

/**
 * Log batches baked: `bakes` [{ recipeId, batches, reason (drop | porch | test |
 * other), dropId?, note?, date? }]. Each one takes what the recipe uses out of
 * what's on hand and remembers what it cost then.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const data = await req.json().catch(() => ({}));
    const list: Record<string, unknown>[] = Array.isArray(data.bakes) ? data.bakes.slice(0, 100) : [data];
    const costs = await loadCosts();
    const recipes = new Map(costs.recipes.map((r) => [r.id, r]));
    const ingredients = new Map(costs.ingredients.map((i) => [i.id, i]));
    const rows = list
      .filter((b) => Number(b.batches) > 0)
      .map((b) => {
        const recipe = recipes.get(String(b.recipeId ?? ""));
        if (!recipe) throw new CostInputError("Pick a recipe");
        const batches = positive(b.batches, "Batches")!;
        const usage = [...batchUsage(recipe.lines, ingredients)].map(([ingredientId, amount]) => ({ ingredientId, amount: amount * batches }));
        return {
          recipeId: recipe.id,
          batches,
          reason: REASONS.includes(String(b.reason)) ? String(b.reason) : "other",
          dropId: b.dropId ? String(b.dropId) : null,
          note: String(b.note ?? "").trim().slice(0, 300) || null,
          date: b.date ? day(b.date) : new Date(),
          usage,
          cost: Math.round(recipe.cost.batch * batches * 100),
        };
      });
    if (!rows.length) throw new CostInputError("Enter how many batches");
    await prisma.bake.createMany({ data: rows });
    return NextResponse.json(await loadCosts());
  } catch (e) {
    return NextResponse.json({ error: e instanceof CostInputError ? e.message : "Couldn't save that" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.bake.deleteMany({ where: { id: new URL(req.url).searchParams.get("id") ?? "" } });
  return NextResponse.json(await loadCosts());
}
