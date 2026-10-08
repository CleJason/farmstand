import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // The public drop page uses this too; only admins get the orders/customers
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const drop = await prisma.drop.findUnique({
    where: { id },
    include: {
      pickupSlots: true,
      dropProducts: {
        include: { product: true },
      },
      orders: isAdmin && {
        include: {
          items: {
            include: {
              dropProduct: { include: { product: true } },
            },
          },
          pickupSlot: true,
          user: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!drop) {
    return NextResponse.json({ error: "Drop not found" }, { status: 404 });
  }

  return NextResponse.json(drop);
}

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
  const { title, description, orderOpenAt, orderCloseAt, status, maxOrders } = data;

  const drop = await prisma.drop.update({
    where: { id },
    data: {
      title,
      description,
      orderOpenAt: orderOpenAt ? new Date(orderOpenAt) : undefined,
      orderCloseAt: orderCloseAt ? new Date(orderCloseAt) : undefined,
      status: status || undefined,
      maxOrders: maxOrders !== undefined ? (maxOrders ? Number(maxOrders) : null) : undefined,
    },
    include: {
      pickupSlots: true,
      dropProducts: { include: { product: true } },
    },
  });

  return NextResponse.json(drop);
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
  await prisma.drop.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
