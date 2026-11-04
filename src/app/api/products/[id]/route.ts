import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { cleanPosition } from "@/lib/image-position";
import { cleanBoxGroups, cleanBoxOptions, cleanBoxSize } from "@/lib/box";
import { cleanAddOns } from "@/lib/addons";

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
