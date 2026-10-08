import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { DropInputError, parseProducts, parseSlots } from "@/lib/drop-input";

export async function GET() {
  const drops = await prisma.drop.findMany({
    include: {
      pickupSlots: true,
      dropProducts: {
        include: { product: true },
      },
      orders: {
        select: { id: true, total: true, status: true },
      },
    },
    orderBy: { orderOpenAt: "desc" },
  });
  return NextResponse.json(drops);
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await req.json();
  const { title, description, orderOpenAt, orderCloseAt, status, maxOrders, pickupSlots, products } = data;

  if (!title || !orderOpenAt || !orderCloseAt) {
    return NextResponse.json({ error: "Title and order open/close dates are required" }, { status: 400 });
  }

  let slots, dropProducts;
  try {
    slots = parseSlots(pickupSlots).map(({ id: _id, ...s }) => s);
    dropProducts = parseProducts(products);
  } catch (err) {
    if (err instanceof DropInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  const drop = await prisma.drop.create({
    data: {
      title,
      description: description || null,
      orderOpenAt: new Date(orderOpenAt),
      orderCloseAt: new Date(orderCloseAt),
      status: status || "DRAFT",
      maxOrders: maxOrders ? Number(maxOrders) : null,
      pickupSlots: { create: slots },
      dropProducts: { create: dropProducts },
    },
    include: {
      pickupSlots: true,
      dropProducts: { include: { product: true } },
    },
  });

  return NextResponse.json(drop);
}
