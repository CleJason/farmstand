import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { fireNotification } from "@/lib/notifications";
import { getStripe } from "@/lib/stripe";
import { getSetting } from "@/lib/settings";
import { adjustStock, countsStock } from "@/lib/stock";

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

  return NextResponse.json(orders);
}

/** Thrown for problems with the customer's order; becomes a 400 with this message. */
class OrderError extends Error {}

const PAYMENT_METHODS = ["STRIPE", "PAYPAL", "VENMO"];

type RequestedItem = { id: string; quantity: number };

type PricedLine = {
  dropProductId: string | null;
  farmstandItemId: string | null;
  name: string;
  quantity: number;
  price: number; // cents, from the database
};

/** Merge duplicate lines and validate quantities. Client-sent prices are ignored. */
function parseItems(items: unknown, key: "dropProductId" | "farmstandItemId"): RequestedItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new OrderError("No items provided");
  }
  const merged = new Map<string, number>();
  for (const it of items) {
    const id = it?.[key];
    const quantity = Number(it?.quantity);
    if (typeof id !== "string" || !id) throw new OrderError("Invalid item in order");
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new OrderError("Quantities must be whole numbers of at least 1");
    }
    merged.set(id, (merged.get(id) ?? 0) + quantity);
  }
  return [...merged].map(([id, quantity]) => ({ id, quantity }));
}

function checkStock(name: string, quantity: number, remaining: number) {
  if (quantity > remaining) {
    throw new OrderError(
      remaining > 0 ? `Only ${remaining} ${name} left` : `${name} is sold out`
    );
  }
}

/** Look up real prices and check availability/stock for the requested order. */
async function priceOrder(
  db: Prisma.TransactionClient,
  input: { type: string; dropId?: string; pickupSlotId?: string; items: unknown }
): Promise<PricedLine[]> {
  if (input.type === "FARMSTAND") {
    const requested = parseItems(input.items, "farmstandItemId");
    const stock = await db.farmstandItem.findMany({
      where: { id: { in: requested.map((r) => r.id) } },
    });
    return requested.map(({ id, quantity }) => {
      const item = stock.find((s) => s.id === id);
      if (!item || !item.available) throw new OrderError("An item in your cart is no longer available");
      checkStock(item.name, quantity, item.quantityAvailable - item.quantitySold);
      return { dropProductId: null, farmstandItemId: id, name: item.name, quantity, price: item.price };
    });
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
  if (drop.pickupSlots.length > 0 && !drop.pickupSlots.some((s) => s.id === input.pickupSlotId)) {
    throw new OrderError("Please choose a pickup time");
  }
  if (drop.maxOrders) {
    const placed = await db.order.count({
      where: { dropId: drop.id, status: { in: ["AWAITING_CONFIRM", "PAID", "READY", "PICKED_UP"] } },
    });
    if (placed >= drop.maxOrders) throw new OrderError("This drop is sold out");
  }

  const requested = parseItems(input.items, "dropProductId");
  return requested.map(({ id, quantity }) => {
    const dp = drop.dropProducts.find((d) => d.id === id);
    if (!dp) throw new OrderError("An item in your cart is not part of this drop");
    if (dp.quantityLimit !== null) {
      checkStock(dp.product.name, quantity, dp.quantityLimit - dp.quantitySold);
    }
    return {
      dropProductId: id,
      farmstandItemId: null,
      name: dp.product.name,
      quantity,
      price: dp.priceOverride ?? dp.product.price,
    };
  });
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const data = await req.json();
    const {
      dropId,
      pickupSlotId,
      items,
      notes,
      guestEmail,
      guestPhone,
      manualPaymentRef,
    } = data;
    const type = data.type === "FARMSTAND" ? "FARMSTAND" : "DROP";
    const paymentMethod = data.paymentMethod || "STRIPE";

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }

    const orderInput = { type, dropId, pickupSlotId, items };
    const orderData = (lines: PricedLine[]) => {
      const subtotal = lines.reduce((acc, l) => acc + l.quantity * l.price, 0);
      return {
        type,
        dropId: type === "DROP" ? dropId : null,
        pickupSlotId: type === "DROP" ? pickupSlotId || null : null,
        userId: session?.user?.id || null,
        guestEmail: guestEmail || null,
        guestPhone: guestPhone || null,
        paymentMethod,
        subtotal,
        total: subtotal,
        notes: notes || null,
        manualPaymentRef: manualPaymentRef || null,
        items: {
          create: lines.map((l) => ({
            dropProductId: l.dropProductId,
            farmstandItemId: l.farmstandItemId,
            quantity: l.quantity,
            priceAtPurchase: l.price,
          })),
        },
      };
    };
    const include = { pickupSlot: true } as const;

    if (paymentMethod === "STRIPE") {
      const stripe = await getStripe();
      if (!stripe) {
        return NextResponse.json({ error: "Card payments are not set up yet" }, { status: 500 });
      }

      // Stock is checked now but only counted once the payment succeeds (webhook).
      const lines = await priceOrder(prisma, orderInput);
      const base = orderData(lines);
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
    // owner confirms the payment. Serializable so concurrent orders can't
    // both pass the stock check.
    const { order, lines } = await prisma.$transaction(
      async (tx) => {
        const lines = await priceOrder(tx, orderInput);
        const order = await tx.order.create({
          data: { ...orderData(lines), status: "AWAITING_CONFIRM" },
          include,
        });
        if (countsStock(order.status)) await adjustStock(tx, lines, 1);
        return { order, lines };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    // Owner alert only — the customer is confirmed once the owner marks it PAID.
    const appUrl = await getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || "");
    await fireNotification("order.awaiting_payment", {
      orderId: order.id,
      type: order.type,
      total: order.total,
      paymentMethod: order.paymentMethod,
      customerName: session?.user?.name || null,
      customerEmail: order.guestEmail || session?.user?.email || null,
      customerPhone: order.guestPhone,
      pickupSlot: order.pickupSlot?.label,
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
    if (err instanceof OrderError) {
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
