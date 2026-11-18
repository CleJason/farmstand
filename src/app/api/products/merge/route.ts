import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { linkKey } from "@/lib/costs-plan";

/**
 * Merge a duplicate product (`from`) into the one to keep (`into`): its drops
 * and their orders move over, so order history and sales stay complete, then
 * the duplicate is deleted. If both were in the same drop, that drop's orders
 * for the duplicate join the kept one's.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const fromId = String(data.from ?? "");
  const intoId = String(data.into ?? "");
  if (!fromId || !intoId || fromId === intoId) return NextResponse.json({ error: "Pick a different product to merge into" }, { status: 400 });
  const [from, into] = await Promise.all([
    prisma.product.findUnique({ where: { id: fromId }, include: { dropProducts: true } }),
    prisma.product.findUnique({ where: { id: intoId }, include: { dropProducts: true } }),
  ]);
  if (!from || !into) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    for (const dp of from.dropProducts) {
      const same = into.dropProducts.find((x) => x.dropId === dp.dropId);
      if (same) {
        // Both in this drop: its orders and sold count join the kept product's
        await tx.orderItem.updateMany({ where: { dropProductId: dp.id }, data: { dropProductId: same.id } });
        await tx.dropProduct.update({ where: { id: same.id }, data: { quantitySold: { increment: dp.quantitySold } } });
        await tx.dropProduct.delete({ where: { id: dp.id } });
      } else {
        await tx.dropProduct.update({ where: { id: dp.id }, data: { productId: into.id } });
      }
    }
    // Cost tags: the duplicate's move over when it had a different name and the kept one has none
    const fromKey = linkKey(from.name);
    const intoKey = linkKey(into.name);
    if (fromKey !== intoKey) {
      const has = await tx.recipeLink.count({ where: { name: intoKey } });
      if (has) await tx.recipeLink.deleteMany({ where: { name: fromKey } });
      else await tx.recipeLink.updateMany({ where: { name: fromKey }, data: { name: intoKey } });
    }
    await tx.product.delete({ where: { id: from.id } });
  });
  return NextResponse.json({ ok: true });
}
