import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { DropInputError, parseProducts, parseSlots } from "@/lib/drop-input";
import { hideAddress } from "@/lib/pickup";

export async function GET() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const drops = await prisma.drop.findMany({
    include: {
      pickupSlots: { orderBy: { pickupDate: "asc" } },
      dropProducts: {
        include: { product: true },
      },
      // Order counts/totals are for the admin dashboard only
      orders: isAdmin && {
        select: {
          id: true,
          total: true,
          status: true,
          // for the mix & match box tally (what to bake)
          items: { where: { selections: { not: Prisma.DbNull } }, select: { dropProductId: true, quantity: true, selections: true } },
        },
      },
    },
    orderBy: { orderOpenAt: "desc" },
  });
  // Exact pickup addresses only go to paid customers
  return NextResponse.json(
    isAdmin ? drops : drops.map((d) => ({ ...d, pickupSlots: d.pickupSlots.map(hideAddress) }))
  );
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
