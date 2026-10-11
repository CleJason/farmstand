import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { fireNotification } from "@/lib/notifications";
import { generateRewardCode, orderProductNames, reviewSettings } from "@/lib/review-requests";

class ReviewError extends Error {}

/**
 * A customer's review, sent from the private link in their "How was it?"
 * email. It waits hidden until the owner approves it. A first review gets a
 * single-use thank-you discount code, shown on the page and emailed.
 */
export async function POST(req: Request) {
  const data = await req.json().catch(() => ({}));
  const rating = Number(data.rating);
  const body = String(data.body ?? "").trim();
  const name = String(data.name ?? "").trim();

  try {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ReviewError("Please choose 1 to 5 stars");
    if (!body) throw new ReviewError("Please write a few words");
    if (body.length > 2000) throw new ReviewError("Please keep it under 2,000 characters");
    if (!name || name.length > 60) throw new ReviewError("Please add your name (as you'd like it shown)");

    const { percent } = await reviewSettings();
    const result = await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { reviewToken: String(data.token ?? "") || "-" },
          include: { user: true, items: { include: { dropProduct: { include: { product: true } }, farmstandItem: true } } },
        });
        if (!order) throw new ReviewError("This review link isn't valid anymore");
        if (await tx.review.findUnique({ where: { orderId: order.id } })) {
          throw new ReviewError("You've already reviewed this order. Thank you!");
        }
        const email = (order.guestEmail || order.user?.email || "").toLowerCase() || null;
        // Tags: only products that were actually in the order
        const onOrder = orderProductNames(order.items);
        const picked = Array.isArray(data.products) ? data.products.map(String) : onOrder;
        const products = onOrder.filter((p) => picked.includes(p));

        const first = !!email && (await tx.review.count({ where: { email } })) === 0;
        let rewardCode: string | null = null;
        if (first && percent > 0) {
          rewardCode = generateRewardCode();
          await tx.discountCode.create({
            // Only works for the reviewer
            data: { code: rewardCode, type: "PERCENT", value: percent, appliesTo: "ALL", maxUses: 1, allowedEmails: [email] },
          });
        }
        await tx.review.create({
          data: {
            name,
            rating,
            body,
            source: "Website",
            products: products.join(", ") || null,
            visible: false, // the owner approves it first
            email,
            orderId: order.id,
            rewardCode,
          },
        });
        return { email, name, rewardCode };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    if (result.rewardCode && result.email) {
      const appUrl = await getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || "");
      await fireNotification("review.thanks", {
        customerEmail: result.email,
        customerName: result.name,
        code: result.rewardCode,
        percent,
        shopUrl: appUrl,
      });
    }
    return NextResponse.json({ ok: true, code: result.rewardCode, percent: result.rewardCode ? percent : 0 });
  } catch (err) {
    if (err instanceof ReviewError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2002" || err.code === "P2034")) {
      return NextResponse.json({ error: "You've already reviewed this order. Thank you!" }, { status: 400 });
    }
    throw err;
  }
}
