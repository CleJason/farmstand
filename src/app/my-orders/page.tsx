import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import { formatPickup, isPaidStatus, pickupAddressFor } from "@/lib/pickup";
import { describePicks } from "@/lib/box";
import { describeAddOns } from "@/lib/addons";
import { formatPrice } from "@/lib/utils";
import { SignOutButton, StoreHeader } from "@/components/StoreChrome";
import LegalFooter from "@/components/LegalFooter";
import { textFor, type CopyKey } from "@/lib/copy";

export const metadata = { title: "My Orders", robots: { index: false } };

const STATUS_CLASSES: Record<string, string> = {
  AWAITING_CONFIRM: "bg-amber-50 text-amber-700",
  PAID: "bg-emerald-50 text-emerald-700",
  READY: "bg-blue-50 text-blue-700",
  PICKED_UP: "bg-stone-100 text-stone-600",
  CANCELLED: "bg-red-50 text-red-600",
  REFUNDED: "bg-purple-50 text-purple-600",
};

/** A signed-in customer's orders on this site, plus a summary of history brought over from before. */
export default async function MyOrdersPage() {
  await connection();
  const session = await auth();
  if (!session?.user?.email) redirect("/login?callbackUrl=/my-orders");
  const email = session.user.email.toLowerCase();

  const [site, orders, contact] = await Promise.all([
    getSiteSettings(),
    prisma.order.findMany({
      where: {
        // Unfinished card checkouts aren't real orders
        status: { not: "PENDING" },
        OR: [{ userId: session.user.id }, { guestEmail: { equals: email, mode: "insensitive" } }],
      },
      include: {
        items: { include: { dropProduct: { include: { product: true } }, farmstandItem: true } },
        pickupSlot: true,
        drop: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contact.findFirst({ where: { OR: [{ email }, { otherEmails: { has: email } }] } }),
  ]);
  const text = textFor(site);
  // Reviews they've left (here or linked by the owner), under any of their emails
  const reviews = await prisma.review.findMany({
    where: { email: { in: [...new Set([email, contact?.email, ...(contact?.otherEmails ?? [])].filter(Boolean) as string[])] } },
    orderBy: { reviewDate: "desc" },
  });

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <StoreHeader />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-stone-900">{text("orders.title")}</h1>
          <SignOutButton className="text-sm text-stone-500 hover:text-stone-900 font-medium" />
        </div>

        {contact && (contact.importedOrders > 0 || contact.importedSpent > 0) && (
          <p className="text-sm text-stone-600 bg-white border border-stone-200 rounded-xl p-4">
            {text("orders.regular", { count: contact.importedOrders })}
          </p>
        )}

        {orders.length === 0 ? (
          <div className="bg-white rounded-xl border border-stone-200 p-8 text-center space-y-3">
            <p className="text-stone-600">{text("orders.empty")}</p>
            <Link href="/#drops" className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-2.5 rounded-full text-sm">
              {text("orders.browse")}
            </Link>
          </div>
        ) : (
          orders.map((o) => {
            const status = {
              label: o.status in STATUS_CLASSES ? text(`status.${o.status}` as CopyKey) : o.status,
              classes: STATUS_CLASSES[o.status] ?? "bg-stone-100 text-stone-600",
            };
            const address = o.type === "DROP" && isPaidStatus(o.status) ? pickupAddressFor(o.pickupSlot, site) : null;
            return (
              <div key={o.id} className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-mono font-semibold text-stone-700">#{o.id.slice(-6).toUpperCase()}</span>
                    <span className="text-stone-400">
                      {" "}
                      · {o.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${status.classes}`}>{status.label}</span>
                </div>
                {o.drop && <p className="font-semibold text-stone-900">{o.drop.title}</p>}
                <ul className="text-sm text-stone-700 space-y-1">
                  {o.items.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3">
                      <span>
                        {i.quantity} × {i.dropProduct?.product.name ?? i.farmstandItem?.name ?? "Item"}
                        {describePicks(i.selections) && (
                          <span className="block text-xs text-stone-500 pl-4">{describePicks(i.selections)}</span>
                        )}
                        {describeAddOns(i.addOns) && (
                          <span className="block text-xs text-stone-500 pl-4">{describeAddOns(i.addOns)}</span>
                        )}
                      </span>
                      <span className="text-stone-500">{formatPrice(i.priceAtPurchase * i.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between text-sm font-semibold text-stone-900 border-t border-stone-100 pt-2">
                  <span>{text("orders.total")}</span>
                  <span>{formatPrice(o.total)}</span>
                </div>
                {o.pickupTime && (
                  <div className="text-sm bg-[#FAF6F0] rounded-lg p-3">
                    <b>{text("orders.pickup")}</b> {formatPickup(o.pickupTime)}
                    {address ? (
                      <span className="block whitespace-pre-line text-stone-600 mt-1">{address}</span>
                    ) : (
                      o.pickupSlot?.location && <span className="block text-stone-600 mt-1">📍 {o.pickupSlot.location}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        {reviews.length > 0 && (
          <section className="space-y-3 pt-4">
            <h2 className="text-lg font-bold text-stone-900">{text("orders.reviews")}</h2>
            {reviews.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border border-stone-200 p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-amber-500">
                    {"★".repeat(r.rating)}
                    <span className="text-stone-300">{"★".repeat(5 - r.rating)}</span>
                  </span>
                  <span className="text-xs text-stone-400">
                    {r.reviewDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {!r.visible && " · waiting for approval"}
                  </span>
                </div>
                <p className="text-sm text-stone-700 whitespace-pre-line">{r.body}</p>
                {r.products && <p className="text-xs text-stone-500">{r.products}</p>}
                {r.reply && (
                  <p className="text-sm text-stone-600 bg-[#FAF6F0] rounded-lg p-2.5">
                    <b>{site.SITE_NAME}:</b> {r.reply}
                  </p>
                )}
              </div>
            ))}
          </section>
        )}
        <p className="text-xs text-stone-400 text-center">{text("orders.questions")}</p>
      </main>
      <LegalFooter />
    </div>
  );
}
