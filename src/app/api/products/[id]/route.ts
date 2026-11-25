import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { cleanPosition } from "@/lib/image-position";
import { cleanBoxGroups, cleanBoxOptions, cleanBoxSize } from "@/lib/box";
import { cleanAddOns } from "@/lib/addons";
import { linkKey } from "@/lib/costs-plan";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const data = await req.json();
  const { name, description, price, imageUrl, category, active } = data;

  const groups = cleanBoxGroups(data.boxGroups);
  const before = await prisma.product.findUnique({ where: { id }, select: { name: true } });
  const product = await prisma.product.update({
    where: { id },
    data: {
      name,
      description: description || null,
      price: price !== undefined ? Math.round(Number(price)) : undefined,
      imageUrl: imageUrl !== undefined ? imageUrl : undefined,
      imagePosition: cleanPosition(data.imagePosition),
      category: category !== undefined ? category : undefined,
      active: active !== undefined ? Boolean(active) : undefined,
      boxSize: groups.length
        ? groups.reduce((sum, g) => sum + g.size, 0)
        : data.boxSize !== undefined
          ? cleanBoxSize(data.boxSize)
          : undefined,
      boxOptions: groups.length
        ? groups.flatMap((g) => g.options)
        : data.boxOptions !== undefined
          ? cleanBoxOptions(data.boxOptions)
          : undefined,
      boxGroups: groups.length ? groups : data.boxGroups !== undefined ? Prisma.DbNull : undefined,
      addOns: data.addOns !== undefined ? cleanAddOns(data.addOns) : undefined,
    },
  });

  // Renamed: its recipe tags (and its box choices' tags) follow it to the new name,
  // unless something is already tagged under the new name
  if (before && typeof name === "string" && linkKey(before.name) !== linkKey(name)) {
    const [oldKey, newKey] = [linkKey(before.name), linkKey(name)];
    const taken = await prisma.recipeLink.count({ where: { name: newKey } });
    if (!taken) await prisma.recipeLink.updateMany({ where: { name: oldKey }, data: { name: newKey } });
    const choices = await prisma.recipeLink.findMany({ where: { name: { startsWith: `${oldKey} › ` } }, select: { id: true, name: true } });
    for (const c of choices) {
      const to = newKey + c.name.slice(oldKey.length);
      if (!(await prisma.recipeLink.count({ where: { name: to } }))) await prisma.recipeLink.update({ where: { id: c.id }, data: { name: to } });
    }
  }

  return NextResponse.json(product);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
