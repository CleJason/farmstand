import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { DropInputError, parseProducts, parseSlots } from "@/lib/drop-input";
import { hideAddress } from "@/lib/pickup";
import { announceDrop } from "@/lib/drop-alerts";

export async function GET() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const drops = await prisma.drop.findMany({
    // Drafts are only visible in the admin
    where: isAdmin ? {} : { status: { not: "DRAFT" } },
    include: {
      pickupSlots: { orderBy: { pickupDate: "asc" } },
      dropProducts: {
        include: { product: true },
        orderBy: [{ position: "asc" }, { id: "asc" }],
      },
      // Order counts/totals are for the admin dashboard only
      orders: isAdmin && {
        select: {
          id: true,
          total: true,
          status: true,
          // for the mix & match box tally (what to bake)
          items: {
            where: { OR: [{ selections: { not: Prisma.DbNull } }, { addOns: { not: Prisma.DbNull } }] },
            select: { dropProductId: true, quantity: true, selections: true, addOns: true },
          },
        },
      },
    },
    orderBy: { orderOpenAt: "desc" },
  });
  // Sold out: every product hit its limit, or the drop hit its max orders
  const placed = await prisma.order.groupBy({
    by: ["dropId"],
    where: { dropId: { in: drops.map((d) => d.id) }, status: { in: ["AWAITING_CONFIRM", "PAID", "READY", "PICKED_UP"] } },
    _count: true,
  });
  const placedBy = new Map(placed.map((p) => [p.dropId, p._count]));
  const withSoldOut = drops.map((d) => ({
    ...d,
    soldOut:
      (d.dropProducts.length > 0 && d.dropProducts.every((dp) => dp.quantityLimit !== null && dp.quantitySold >= dp.quantityLimit)) ||
      (!!d.maxOrders && (placedBy.get(d.id) ?? 0) >= d.maxOrders),
  }));
  // Exact pickup addresses only go to paid customers
  return NextResponse.json(
    isAdmin ? withSoldOut : withSoldOut.map((d) => ({ ...d, pickupSlots: d.pickupSlots.map(hideAddress) }))
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

  // Published and already open: alert the subscribers now (otherwise when it opens)
  if (drop.status === "OPEN") await announceDrop(drop.id);
  return NextResponse.json(drop);
}
