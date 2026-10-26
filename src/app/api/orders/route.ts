import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { fireNotification } from "@/lib/notifications";
import { getStripe } from "@/lib/stripe";
import { getSetting } from "@/lib/settings";
import { DiscountError, evaluateDiscount, normalizeCode } from "@/lib/discounts";
import { evaluateGift, GiftError, normalizeGiftCode } from "@/lib/gift";
import { applyStatusChange } from "@/lib/order-effects";
import { getSiteSettings } from "@/lib/site";
import { type BoxPick, describePicks, dropBoxOptions, isBox, picksKey, validatePicks } from "@/lib/box";
import { type AddOn, addOnsKey, addOnsTotal, chosenAddOns, describeAddOns, productAddOns } from "@/lib/addons";
import {
  formatPickup,
  hideAddress,
  isPaidStatus,
  pickupAddressFor,
  pickupTimeCounts,
  pickupTimes,
} from "@/lib/pickup";

export async function GET(req: Request) {
  const session = await auth();
  const { searchParams } = new URL(req.url);
  const dropId = searchParams.get("dropId");

  if (session?.user?.role !== "ADMIN" && !session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const whereClause: any = {};
  if (session?.user?.role !== "ADMIN") {
    whereClause.userId = session?.user?.id;
  } else if (dropId) {
    whereClause.dropId = dropId;
  }

  const orders = await prisma.order.findMany({
    where: whereClause,
    include: {
      items: {
        include: {
          dropProduct: { include: { product: true } },
          farmstandItem: true,
        },
      },
      pickupSlot: true,
      user: true,
      drop: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (session?.user?.role === "ADMIN") return NextResponse.json(orders);
  // A customer's own orders: exact pickup address only on paid ones
  return NextResponse.json(
    orders.map((o) => ({
      ...o,
      pickupSlot: o.pickupSlot && !isPaidStatus(o.status) ? hideAddress(o.pickupSlot) : o.pickupSlot,
    }))
  );
}

/** Thrown for problems with the customer's order; becomes a 400 with this message. */
class OrderError extends Error {}

const PAYMENT_METHODS = ["STRIPE", "PAYPAL", "VENMO"];

type RequestedItem = { id: string; quantity: number; selections: unknown; addOns: unknown };

type PricedLine = {
  dropProductId: string | null;
  farmstandItemId: string | null;
  name: string; // includes the box picks and add-ons, for notifications
  quantity: number;
  price: number; // cents per item, from the database (add-ons included)
  selections: BoxPick[] | null;
  addOns: AddOn[] | null;
};

/** Validate quantities. Client-sent prices are ignored. */
function parseItems(items: unknown, key: "dropProductId" | "farmstandItemId"): RequestedItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new OrderError("No items provided");
  }
  return items.map((it) => {
    const id = it?.[key];
    const quantity = Number(it?.quantity);
    if (typeof id !== "string" || !id) throw new OrderError("Invalid item in order");
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new OrderError("Quantities must be whole numbers of at least 1");
    }
    return { id, quantity, selections: it?.selections, addOns: it?.addOns };
  });
}

/** Combine lines for the same item (and the same box picks and add-ons). */
function mergeLines(lines: PricedLine[]): PricedLine[] {
  const merged = new Map<string, PricedLine>();
  for (const l of lines) {
    const key = `${l.dropProductId ?? l.farmstandItemId}#${picksKey(l.selections)}#${addOnsKey(l.addOns?.map((a) => a.name))}`;
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, quantity: prev.quantity + l.quantity } : l);
  }
  return [...merged.values()];
}

/** Stock is per product, so add up every line (every box) of the same one. */
function totalsById(lines: PricedLine[], key: "dropProductId" | "farmstandItemId") {
  const totals = new Map<string, number>();
  for (const l of lines) totals.set(l[key]!, (totals.get(l[key]!) ?? 0) + l.quantity);
  return totals;
}

function checkStock(name: string, quantity: number, remaining: number) {
  if (quantity > remaining) {
    throw new OrderError(
      remaining > 0 ? `Only ${remaining} ${name} left` : `${name} is sold out`
    );
  }
}

/**
 * Look up real prices and check availability/stock for the requested order,
 * plus (for drops) that the chosen pickup time exists and isn't full.
 */
async function priceOrder(
  db: Prisma.TransactionClient,
  input: { type: string; dropId?: string; pickupSlotId?: string; pickupTime?: string; items: unknown }
): Promise<{ lines: PricedLine[]; pickupTime: Date | null }> {
  if (input.type === "FARMSTAND") {
    const requested = parseItems(input.items, "farmstandItemId");
    const stock = await db.farmstandItem.findMany({
      where: { id: { in: requested.map((r) => r.id) } },
    });
    const lines = mergeLines(
      requested.map(({ id, quantity }) => {
        const item = stock.find((s) => s.id === id);
        if (!item || !item.available) throw new OrderError("An item in your cart is no longer available");
        return { dropProductId: null, farmstandItemId: id, name: item.name, quantity, price: item.price, selections: null, addOns: null };
      })
    );
    for (const [id, quantity] of totalsById(lines, "farmstandItemId")) {
      const item = stock.find((s) => s.id === id)!;
      checkStock(item.name, quantity, item.quantityAvailable - item.quantitySold);
    }
    return { lines, pickupTime: null };
  }

  if (!input.dropId) throw new OrderError("No drop selected");
  const drop = await db.drop.findUnique({
    where: { id: input.dropId },
    include: { dropProducts: { include: { product: true } }, pickupSlots: true },
  });
  if (!drop) throw new OrderError("Drop not found");

  const now = new Date();
  if (drop.status !== "OPEN" || now < drop.orderOpenAt || now > drop.orderCloseAt) {
    throw new OrderError("Ordering for this drop is closed");
  }
  let pickupTime: Date | null = null;
  if (drop.pickupSlots.length > 0) {
    const slot = drop.pickupSlots.find((s) => s.id === input.pickupSlotId);
    if (!slot) throw new OrderError("Please choose a pickup day");
    const times = pickupTimes(slot);
    const chosen = times.length === 1 ? times[0] : times.find((t) => t.toISOString() === input.pickupTime);
    if (!chosen) throw new OrderError("Please choose a pickup time");
    if (slot.maxPerTime !== null) {
      const taken = (await pickupTimeCounts(db, [slot.id])).get(`${slot.id}|${chosen.toISOString()}`) ?? 0;
      if (taken >= slot.maxPerTime) {
        throw new OrderError("That pickup time just filled up — please choose another");
      }
    }
    pickupTime = chosen;
  }
  if (drop.maxOrders) {
    const placed = await db.order.count({
      where: { dropId: drop.id, status: { in: ["AWAITING_CONFIRM", "PAID", "READY", "PICKED_UP"] } },
    });
    if (placed >= drop.maxOrders) throw new OrderError("This drop is sold out");
  }

  const requested = parseItems(input.items, "dropProductId");
  const lines = mergeLines(
    requested.map(({ id, quantity, selections, addOns }) => {
      const dp = drop.dropProducts.find((d) => d.id === id);
      if (!dp) throw new OrderError("An item in your cart is not part of this drop");
      let picks: BoxPick[] | null = null;
      let extras: AddOn[] = [];
      try {
        if (isBox(dp.product)) {
          picks = validatePicks(
            { ...dp.product, boxOptions: dropBoxOptions(dp.product.boxOptions, dp.boxOptions) },
            selections
          );
        }
        extras = chosenAddOns(dp.product.name, productAddOns(dp.product.addOns), addOns);
      } catch (e) {
        throw new OrderError((e as Error).message);
      }
      const details = [describePicks(picks), describeAddOns(extras)].filter(Boolean).join("; ");
      return {
        dropProductId: id,
        farmstandItemId: null,
        name: details ? `${dp.product.name} (${details})` : dp.product.name,
        quantity,
        // Add-ons are per item, priced from the product
        price: (dp.priceOverride ?? dp.product.price) + addOnsTotal(extras),
        selections: picks,
        addOns: extras.length ? extras : null,
      };
    })
  );
  for (const [id, quantity] of totalsById(lines, "dropProductId")) {
    const dp = drop.dropProducts.find((d) => d.id === id)!;
    if (dp.quantityLimit !== null) {
      checkStock(dp.product.name, quantity, dp.quantityLimit - dp.quantitySold);
    }
  }
  return { lines, pickupTime };
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const data = await req.json();
    const {
      dropId,
      pickupSlotId,
      pickupTime,
      items,
      notes,
      guestEmail,
      guestPhone,
      manualPaymentRef,
    } = data;
    const type = data.type === "FARMSTAND" ? "FARMSTAND" : "DROP";
    const paymentMethod = data.paymentMethod || "STRIPE";
    // Who the order is for: required on pre-orders so the owner knows who's picking up
    const guestName = String(data.guestName ?? "").trim().slice(0, 80) || session?.user?.name || null;
    if (type === "DROP" && !guestName) {
      return NextResponse.json({ error: "Please add your name" }, { status: 400 });
    }

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }

    const orderInput = { type, dropId, pickupSlotId, pickupTime, items };

    // Real prices + stock/pickup checks, then the discount code (if any)
    const price = async (db: Prisma.TransactionClient) => {
      const priced = await priceOrder(db, orderInput);
      const subtotal = priced.lines.reduce((acc, l) => acc + l.quantity * l.price, 0);
      let discountCode: string | null = null;
      let discount = 0;
      if (normalizeCode(data.discountCode)) {
        const result = await evaluateDiscount(db, data.discountCode, type, subtotal, guestEmail || session?.user?.email);
        discountCode = result.code.code;
        discount = result.amount;
      }
      // Gift card pays what's left after the discount (up to its balance)
      let giftCode: string | null = null;
      let giftAmount = 0;
      if (normalizeGiftCode(data.giftCode)) {
        const result = await evaluateGift(db, data.giftCode, subtotal - discount);
        giftCode = result.gift.code;
        giftAmount = result.amount;
      }
      return { ...priced, subtotal, discountCode, discount, giftCode, giftAmount };
    };

    const orderData = ({
      lines,
      pickupTime,
      subtotal,
      discountCode,
      discount,
      giftCode,
      giftAmount,
    }: Awaited<ReturnType<typeof price>>) => {
      const total = subtotal - discount - giftAmount;
      return {
        type,
        dropId: type === "DROP" ? dropId : null,
        pickupSlotId: type === "DROP" ? pickupSlotId || null : null,
        pickupTime,
        userId: session?.user?.id || null,
        guestName,
        guestEmail: guestEmail || null,
        guestPhone: guestPhone || null,
        // Nothing left to pay once a gift card covers it all
        paymentMethod: total === 0 ? "GIFT_CARD" : paymentMethod,
        subtotal,
        discountCode,
        discount,
        giftCode,
        giftAmount,
        total,
        notes: notes || null,
        manualPaymentRef: manualPaymentRef || null,
        items: {
          create: lines.map((l) => ({
            dropProductId: l.dropProductId,
            farmstandItemId: l.farmstandItemId,
            // A Porch Pickup item's name stays on the order after the item is deleted
            name: l.farmstandItemId ? l.name : null,
            quantity: l.quantity,
            priceAtPurchase: l.price,
            selections: l.selections ? (l.selections as Prisma.InputJsonValue) : Prisma.DbNull,
            addOns: l.addOns ? (l.addOns as Prisma.InputJsonValue) : Prisma.DbNull,
          })),
        },
      };
    };
    const include = { pickupSlot: true, items: true } as const;

    // Preview the price to see whether a gift card covers everything
    const preview = orderData(await price(prisma));

    if (paymentMethod === "STRIPE" && preview.total > 0) {
      const stripe = await getStripe();
      if (!stripe) {
        return NextResponse.json({ error: "Card payments are not set up yet" }, { status: 500 });
      }

      // Stock is checked now but only counted once the payment succeeds (webhook).
      const base = preview;
      if (base.total < 50) {
        return NextResponse.json(
          { error: "Card payments need a total of at least $0.50 — please choose another payment method" },
          { status: 400 }
        );
      }
      const paymentIntent = await stripe.paymentIntents.create({
        amount: base.total,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: {
          type,
          dropId: dropId || "",
          guestEmail: guestEmail || session?.user?.email || "",
        },
      });

      const order = await prisma.order.create({
        data: {
          ...base,
          status: "PENDING",
          stripePaymentIntentId: paymentIntent.id,
          stripeClientSecret: paymentIntent.client_secret,
        },
        include,
      });

      return NextResponse.json({
        orderId: order.id,
        clientSecret: paymentIntent.client_secret,
        paymentMethod: order.paymentMethod,
        total: order.total,
        status: order.status,
      });
    }

    // Venmo / PayPal: reserve stock now so it can't be oversold while the
    // owner confirms the payment. Fully gift-card-paid orders are PAID right
    // away. Serializable so concurrent orders can't both pass the checks.
    const { order, lines } = await prisma.$transaction(
      async (tx) => {
        const priced = await price(tx);
        const data = orderData(priced);
        const status = data.total === 0 ? "PAID" : "AWAITING_CONFIRM";
        const order = await tx.order.create({ data: { ...data, status }, include });
        await applyStatusChange(tx, order, null, status);
        return { order, lines: priced.lines };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    if (order.status === "PAID") {
      // Covered by a gift card: confirm to the customer straight away
      await fireNotification(order.type === "FARMSTAND" ? "farmstand.purchased" : "order.confirmed", {
        orderId: order.id,
        type: order.type,
        status: order.status,
        paymentMethod: order.paymentMethod,
        total: order.total,
        giftCode: order.giftCode,
        giftAmount: order.giftAmount,
        customerName: order.guestName,
        customerEmail: order.guestEmail || session?.user?.email || null,
        customerPhone: order.guestPhone,
        pickupSlot: order.pickupSlot?.label,
        pickupTime: formatPickup(order.pickupTime),
        pickupLocation: order.pickupSlot?.location ?? null,
        items: lines.map((l) => ({ name: l.name, quantity: l.quantity, price: l.price })),
        pickupAddress: order.type === "DROP" ? pickupAddressFor(order.pickupSlot, await getSiteSettings()) : null,
      });
      return NextResponse.json({
        orderId: order.id,
        clientSecret: null,
        paymentMethod: order.paymentMethod,
        total: order.total,
        status: order.status,
      });
    }

    // Owner alert only — the customer is confirmed once the owner marks it PAID.
    const appUrl = await getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || "");
    await fireNotification("order.awaiting_payment", {
      orderId: order.id,
      type: order.type,
      total: order.total,
      discountCode: order.discountCode,
      discount: order.discount,
      giftCode: order.giftCode,
      giftAmount: order.giftAmount,
      paymentMethod: order.paymentMethod,
      paymentHandle: await getSetting(order.paymentMethod === "PAYPAL" ? "PAYPAL_ME_USERNAME" : "VENMO_USERNAME"),
      customerName: order.guestName,
      // No customer email here: the checkout screen already shows how to pay, so no "how to pay" email.
      // They get the confirmation once it's marked paid. (n8n only emails the customer when this is set.)
      customerEmail: null,
      customerPhone: order.guestPhone,
      pickupSlot: order.pickupSlot?.label,
      pickupTime: formatPickup(order.pickupTime),
      pickupLocation: order.pickupSlot?.location ?? null,
      notes: order.notes,
      manualPaymentRef: order.manualPaymentRef,
      items: lines.map((l) => ({ name: l.name, quantity: l.quantity, price: l.price })),
      ownerEmail: await getSetting("ADMIN_EMAIL"),
      adminUrl: `${appUrl}/admin`,
    });

    return NextResponse.json({
      orderId: order.id,
      clientSecret: null,
      paymentMethod: order.paymentMethod,
      total: order.total,
      status: order.status,
    });
  } catch (err: any) {
    if (err instanceof OrderError || err instanceof DiscountError || err instanceof GiftError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      return NextResponse.json(
        { error: "Lots of orders at once — please try again" },
        { status: 409 }
      );
    }
    console.error("[orders] create error:", err);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
