import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { cleanPosition } from "@/lib/image-position";
import { cleanBoxOptions, cleanBoxSize } from "@/lib/box";
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
      boxSize: data.boxSize !== undefined ? cleanBoxSize(data.boxSize) : undefined,
      boxOptions: data.boxOptions !== undefined ? cleanBoxOptions(data.boxOptions) : undefined,
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
