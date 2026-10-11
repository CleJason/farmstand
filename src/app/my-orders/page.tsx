import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import { formatPickup, isPaidStatus, pickupAddressFor } from "@/lib/pickup";
import { describePicks } from "@/lib/box";
import { formatPrice } from "@/lib/utils";
import { SignOutButton, StoreHeader } from "@/components/StoreChrome";
import LegalFooter from "@/components/LegalFooter";

export const metadata = { title: "My Orders", robots: { index: false } };

const STATUS: Record<string, { label: string; classes: string }> = {
  AWAITING_CONFIRM: { label: "Waiting for payment", classes: "bg-amber-50 text-amber-700" },
  PAID: { label: "Confirmed", classes: "bg-emerald-50 text-emerald-700" },
  READY: { label: "Ready for pickup", classes: "bg-blue-50 text-blue-700" },
  PICKED_UP: { label: "Picked up", classes: "bg-stone-100 text-stone-600" },
  CANCELLED: { label: "Cancelled", classes: "bg-red-50 text-red-600" },
  REFUNDED: { label: "Refunded", classes: "bg-purple-50 text-purple-600" },
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

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <StoreHeader />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-stone-900">My Orders</h1>
          <SignOutButton className="text-sm text-stone-500 hover:text-stone-900 font-medium" />
        </div>

        {contact && (contact.importedOrders > 0 || contact.importedSpent > 0) && (
          <p className="text-sm text-stone-600 bg-white border border-stone-200 rounded-xl p-4">
            Before our new website you&apos;d ordered with us{" "}
            <b>
              {contact.importedOrders} {contact.importedOrders === 1 ? "time" : "times"}
            </b>
            . Thank you for being a regular! 💛
          </p>
        )}

        {orders.length === 0 ? (
          <div className="bg-white rounded-xl border border-stone-200 p-8 text-center space-y-3">
            <p className="text-stone-600">No orders on this site yet.</p>
            <Link href="/#drops" className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-2.5 rounded-full text-sm">
              See what&apos;s available
            </Link>
          </div>
        ) : (
          orders.map((o) => {
            const status = STATUS[o.status] ?? { label: o.status, classes: "bg-stone-100 text-stone-600" };
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
                      </span>
                      <span className="text-stone-500">{formatPrice(i.priceAtPurchase * i.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between text-sm font-semibold text-stone-900 border-t border-stone-100 pt-2">
                  <span>Total</span>
                  <span>{formatPrice(o.total)}</span>
                </div>
                {o.pickupTime && (
                  <div className="text-sm bg-[#FAF6F0] rounded-lg p-3">
                    <b>Pickup:</b> {formatPickup(o.pickupTime)}
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
        <p className="text-xs text-stone-400 text-center">Questions about an order? Just reply to your confirmation email.</p>
      </main>
      <LegalFooter />
    </div>
  );
}
