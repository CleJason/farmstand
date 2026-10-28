import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { hasReviewed, orderProductNames, reviewSettings } from "@/lib/review-requests";
import ReviewForm from "@/components/ReviewForm";
import { auth } from "@/lib/auth";

export const metadata = { title: "Leave a review", robots: { index: false } };

/** The private link from a customer's "How was it?" email. */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; preview?: string }>;
}) {
  await connection();
  const { token, preview } = await searchParams;

  // Admin → Site → Text & buttons: see the form with sample products (nothing is saved)
  if (preview) {
    const session = await auth();
    if (session?.user?.role === "ADMIN") {
      const [site, { percent }] = await Promise.all([getSiteSettings(), reviewSettings()]);
      return (
        <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-4 sm:p-6">
          <div className="max-w-md w-full bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-stone-200 space-y-4">
            <p className="text-xs text-center text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
              Preview: what customers see from their &quot;How was it?&quot; email. Sending here saves nothing.
            </p>
            <ReviewForm
              token=""
              preview
              shopName={site.SITE_NAME}
              products={["Sample item", "Another item"]}
              defaultName=""
              rewardPercent={percent}
            />
          </div>
        </div>
      );
    }
  }
  const [site, order] = await Promise.all([
    getSiteSettings(),
    token
      ? prisma.order.findUnique({
          where: { reviewToken: String(token) },
          include: { user: true, items: { include: { dropProduct: { include: { product: true } }, farmstandItem: true } } },
        })
      : null,
  ]);
  const existing = order ? await prisma.review.findUnique({ where: { orderId: order.id } }) : null;

  // A link sent from Admin → Customers (no order here, e.g. they bought on Hotplate)
  const invite = !order && token ? await prisma.reviewInvite.findUnique({ where: { token: String(token) } }) : null;
  if (invite) {
    if (invite.reviewId) {
      return (
        <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-4 sm:p-6">
          <div className="max-w-md w-full bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-stone-200 text-center space-y-4">
            <h1 className="text-2xl font-bold text-stone-900">Thanks for your review!</h1>
            <Link href="/" className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-2.5 rounded-full text-sm">
              Back to {site.SITE_NAME}
            </Link>
          </div>
        </div>
      );
    }
    const { percent } = await reviewSettings();
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-stone-200 space-y-4">
          <ReviewForm
            token={String(token)}
            shopName={site.SITE_NAME}
            products={[]}
            defaultName={invite.name ?? ""}
            rewardPercent={invite.email && !(await hasReviewed(invite.email)) ? percent : 0}
          />
        </div>
      </div>
    );
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-md w-full bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-stone-200 space-y-4">{children}</div>
    </div>
  );

  if (!order || existing) {
    return shell(
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold text-stone-900">{existing ? "Thanks for your review!" : "This link isn't valid"}</h1>
        <p className="text-sm text-stone-600">
          {existing ? "You've already reviewed this order. We really appreciate it." : "It may have expired or been used already."}
        </p>
        <Link href="/" className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-2.5 rounded-full text-sm">
          Back to {site.SITE_NAME}
        </Link>
      </div>
    );
  }

  const email = (order.guestEmail || order.user?.email || "").toLowerCase();
  const { percent } = await reviewSettings();
  const offer = email && !(await hasReviewed(email)) ? percent : 0;

  return shell(
    <ReviewForm
      token={String(token)}
      shopName={site.SITE_NAME}
      products={orderProductNames(order.items)}
      defaultName={order.user?.name ?? ""}
      rewardPercent={offer}
    />
  );
}
