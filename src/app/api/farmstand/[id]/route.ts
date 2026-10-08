import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { cleanPosition } from "@/lib/image-position";

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
  const { name, description, price, imageUrl, available, quantityAvailable, quantitySold } = data;

  const item = await prisma.farmstandItem.update({
    where: { id },
    data: {
      name,
      description,
      price: price !== undefined ? Math.round(Number(price)) : undefined,
      imageUrl,
      imagePosition: cleanPosition(data.imagePosition),
      available: available !== undefined ? Boolean(available) : undefined,
      quantityAvailable: quantityAvailable !== undefined ? Number(quantityAvailable) : undefined,
      quantitySold: quantitySold !== undefined ? Number(quantitySold) : undefined,
    },
  });

  return NextResponse.json(item);
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
  await prisma.farmstandItem.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
