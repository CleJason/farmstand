import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { isPaidStatus, pickupAddressFor } from "@/lib/pickup";

export const dynamic = "force-dynamic";

/**
 * The exact pickup address for an order — only once it's paid. Order ids are
 * unguessable, so knowing one plus having paid is what unlocks the address.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id }, include: { pickupSlot: true } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (!isPaidStatus(order.status)) {
    return NextResponse.json({ paid: false });
  }
  const site = await getSiteSettings();
  return NextResponse.json({
    paid: true,
    pickupTime: order.pickupTime,
    area: order.pickupSlot?.location ?? site.SITE_PICKUP_AREA,
    address: pickupAddressFor(order.pickupSlot, site),
  });
}
