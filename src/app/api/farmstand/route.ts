import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { cleanPosition } from "@/lib/image-position";
import { standClosedUntil } from "@/lib/stand-hours";

export async function GET() {
  // Before the next open hours start, customers see none (items can be set up ahead); the admin sees all
  const session = await auth();
  if (session?.user?.role !== "ADMIN" && (await standClosedUntil())) return NextResponse.json([]);
  const items = await prisma.farmstandItem.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await req.json();
  const { name, description, price, imageUrl, available, quantityAvailable } = data;

  if (!name || price === undefined) {
    return NextResponse.json({ error: "Name and price are required" }, { status: 400 });
  }

  const item = await prisma.farmstandItem.create({
    data: {
      name,
      description: description || null,
      price: Math.round(Number(price)),
      imageUrl: imageUrl || null,
      imagePosition: cleanPosition(data.imagePosition) ?? null,
      available: available !== undefined ? Boolean(available) : true,
      quantityAvailable: quantityAvailable ? Number(quantityAvailable) : 0,
      quantitySold: 0,
    },
  });

  return NextResponse.json(item);
}
