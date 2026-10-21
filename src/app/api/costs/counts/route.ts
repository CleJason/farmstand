import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { loadCosts } from "@/lib/costs-data";
import { toBase } from "@/lib/costs";
import { CostInputError, nonNegative, unit } from "@/lib/costs-input";

/**
 * Shelf counts: `counts` [{ ingredientId, quantity, unit }]: "there's 3 lb of
 * bread flour right now". On hand goes on from there with purchases and bakes.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const data = await req.json().catch(() => ({}));
    const list: Record<string, unknown>[] = Array.isArray(data.counts) ? data.counts.slice(0, 500) : [data];
    const ingredients = new Map((await prisma.ingredient.findMany()).map((i) => [i.id, i]));
    const now = new Date();
    const rows = list.map((c) => {
      const ing = ingredients.get(String(c.ingredientId ?? ""));
      if (!ing) throw new CostInputError("Pick an ingredient");
      const u = unit(c.unit ?? ing.baseUnit);
      const base = toBase(nonNegative(c.quantity, "Amount"), u, ing);
      if (base.error) throw new CostInputError(`${ing.name} is tracked in ${ing.baseUnit}: count it in that`);
      return { ingredientId: ing.id, amount: base.amount, date: now };
    });
    await prisma.stockCount.createMany({ data: rows });
    return NextResponse.json(await loadCosts());
  } catch (e) {
    return NextResponse.json({ error: e instanceof CostInputError ? e.message : "Couldn't save that" }, { status: 400 });
  }
}
