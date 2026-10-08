import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { DropInputError, parseProducts, parseSlots } from "@/lib/drop-input";
import { pickupTimeCounts, timesWithAvailability } from "@/lib/pickup";

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
      pickupSlots: { orderBy: { pickupDate: "asc" } },
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

  // Each window's selectable times, marking any that are already full
  const counts = await pickupTimeCounts(prisma, drop.pickupSlots.map((s) => s.id));
  const pickupSlots = drop.pickupSlots.map((s) => ({ ...s, times: timesWithAvailability(s, counts) }));

  return NextResponse.json({ ...drop, pickupSlots });
}

/**
 * Edit a drop. Status-only updates (open/close) send just `status`. A full edit
 * also sends `pickupSlots` and `products`, which are synced: existing rows are
 * updated, new ones created, and removed ones deleted unless orders use them.
 */
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

  try {
    const slots = data.pickupSlots !== undefined ? parseSlots(data.pickupSlots) : null;
    const products = data.products !== undefined ? parseProducts(data.products) : null;

    const drop = await prisma.$transaction(async (tx) => {
      const existing = await tx.drop.findUnique({
        where: { id },
        include: {
          pickupSlots: { include: { _count: { select: { orders: true } } } },
          dropProducts: { include: { product: true, _count: { select: { orderItems: true } } } },
        },
      });
      if (!existing) throw new DropInputError("Drop not found");

      await tx.drop.update({
        where: { id },
        data: {
          title,
          description,
          orderOpenAt: orderOpenAt ? new Date(orderOpenAt) : undefined,
          orderCloseAt: orderCloseAt ? new Date(orderCloseAt) : undefined,
          status: status || undefined,
          maxOrders: maxOrders !== undefined ? (maxOrders ? Number(maxOrders) : null) : undefined,
        },
      });

      if (slots) {
        const keep = new Set(slots.filter((s) => s.id).map((s) => s.id));
        for (const old of existing.pickupSlots) {
          if (keep.has(old.id)) continue;
          if (old._count.orders > 0) {
            throw new DropInputError(`"${old.label}" already has orders, so it can't be removed`);
          }
          await tx.pickupSlot.delete({ where: { id: old.id } });
        }
        for (const { id: slotId, ...fields } of slots) {
          if (slotId && existing.pickupSlots.some((s) => s.id === slotId)) {
            await tx.pickupSlot.update({ where: { id: slotId }, data: fields });
          } else {
            await tx.pickupSlot.create({ data: { ...fields, dropId: id } });
          }
        }
      }

      if (products) {
        const keep = new Set(products.map((p) => p.productId));
        for (const old of existing.dropProducts) {
          if (keep.has(old.productId)) continue;
          if (old._count.orderItems > 0) {
            throw new DropInputError(`${old.product.name} already has orders, so it can't be removed from this drop`);
          }
          await tx.dropProduct.delete({ where: { id: old.id } });
        }
        for (const p of products) {
          const old = existing.dropProducts.find((d) => d.productId === p.productId);
          if (old) {
            if (p.quantityLimit !== null && p.quantityLimit < old.quantitySold) {
              throw new DropInputError(
                `${old.product.name}: ${old.quantitySold} already sold, so the limit can't be lower than that`
              );
            }
            await tx.dropProduct.update({
              where: { id: old.id },
              data: { quantityLimit: p.quantityLimit, priceOverride: p.priceOverride },
            });
          } else {
            await tx.dropProduct.create({ data: { ...p, dropId: id } });
          }
        }
      }

      return tx.drop.findUnique({
        where: { id },
        include: { pickupSlots: true, dropProducts: { include: { product: true } } },
      });
    });

    return NextResponse.json(drop);
  } catch (err) {
    if (err instanceof DropInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
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
