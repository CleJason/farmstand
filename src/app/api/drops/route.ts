import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

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

  const drop = await prisma.drop.create({
    data: {
      title,
      description: description || null,
      orderOpenAt: new Date(orderOpenAt),
      orderCloseAt: new Date(orderCloseAt),
      status: status || "DRAFT",
      maxOrders: maxOrders ? Number(maxOrders) : null,
      pickupSlots: {
        create: (pickupSlots || []).map((slot: { label: string; pickupDate: string }) => ({
          label: slot.label,
          pickupDate: new Date(slot.pickupDate),
        })),
      },
      dropProducts: {
        create: (products || []).map((p: { productId: string; quantityLimit?: number; priceOverride?: number }) => ({
          productId: p.productId,
          quantityLimit: p.quantityLimit !== undefined && p.quantityLimit !== null ? Number(p.quantityLimit) : null,
          priceOverride: p.priceOverride !== undefined && p.priceOverride !== null ? Math.round(Number(p.priceOverride)) : null,
        })),
      },
    },
    include: {
      pickupSlots: true,
      dropProducts: { include: { product: true } },
    },
  });

  return NextResponse.json(drop);
}
