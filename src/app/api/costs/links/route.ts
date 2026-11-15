import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { loadCosts } from "@/lib/costs-data";
import { linkKey } from "@/lib/costs-plan";
import { CostInputError, positive } from "@/lib/costs-input";

/**
 * Admin → Costs → Products: the recipes one product (or box choice) uses.
 * `name` plus `links` [{ recipeId, itemsPerUnit }], e.g. Sunday Roll 4-pack:
 * 4 cinnamon rolls + 4 rolls' worth of frosting. Replaces what it had.
 */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const data = await req.json().catch(() => ({}));
    const name = linkKey(String(data.name ?? "")).slice(0, 120);
    if (!name) throw new CostInputError("Which product?");
    const known = new Set((await prisma.recipe.findMany({ select: { id: true } })).map((r) => r.id));
    const raw: unknown[] = Array.isArray(data.links) ? data.links.slice(0, 30) : [];
    const links = new Map<string, number>();
    for (const r of raw) {
      const l = (r ?? {}) as Record<string, unknown>;
      const recipeId = String(l.recipeId ?? "");
      if (!known.has(recipeId)) continue;
      links.set(recipeId, (links.get(recipeId) ?? 0) + positive(l.itemsPerUnit ?? 1, "How much it uses")!);
    }
    await prisma.$transaction([
      prisma.recipeLink.deleteMany({ where: { name } }),
      prisma.recipeLink.createMany({ data: [...links].map(([recipeId, itemsPerUnit]) => ({ name, recipeId, itemsPerUnit })) }),
    ]);
    return NextResponse.json(await loadCosts());
  } catch (e) {
    return NextResponse.json({ error: e instanceof CostInputError ? e.message : "Couldn't save that" }, { status: 400 });
  }
}
