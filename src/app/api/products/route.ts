import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(products);
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await req.json();
  const { name, description, price, imageUrl, category, active } = data;

  if (!name || price === undefined) {
    return NextResponse.json({ error: "Name and price are required" }, { status: 400 });
  }

  const product = await prisma.product.create({
    data: {
      name,
      description: description || null,
      price: Math.round(Number(price)),
      imageUrl: imageUrl || null,
      category: category || null,
      active: active !== undefined ? Boolean(active) : true,
    },
  });

  return NextResponse.json(product);
}
