import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

export const metadata = { title: "Review emails", robots: { index: false } };

async function stopReviewEmails(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const order = token ? await prisma.order.findUnique({ where: { reviewToken: token }, include: { user: true } }) : null;
  const email = (order?.guestEmail || order?.user?.email || "").toLowerCase();
  if (email) await prisma.reviewOptOut.upsert({ where: { email }, update: {}, create: { email } });
  redirect("/review/stop?done=1");
}

/** "Don't ask me for reviews" from the bottom of a review request email (asks for a click, like unsubscribe). */
export default async function StopReviewEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string }>;
}) {
  await connection();
  const { token, done } = await searchParams;
  const site = await getSiteSettings();
  return (
    <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-6 text-center">
      <div className="max-w-md bg-white p-8 rounded-2xl shadow-sm border border-stone-200 space-y-4">
        <h1 className="text-2xl font-bold text-stone-900">{done ? "Got it" : "Stop review requests?"}</h1>
        <p className="text-stone-600 text-sm">
          {done
            ? `We won't ask you for reviews anymore. You'll still get your order confirmations from ${site.SITE_NAME}.`
            : `We'll stop sending "How was everything?" emails. Order confirmations still come as usual.`}
        </p>
        {!done && token ? (
          <form action={stopReviewEmails} className="flex flex-col gap-2">
            <input type="hidden" name="token" value={token} />
            <button className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-2.5 rounded-full text-sm">
              Stop review emails
            </button>
          </form>
        ) : null}
        <Link href="/" className="block text-sm text-stone-500 hover:text-stone-800">
          Back to {site.SITE_NAME}
        </Link>
      </div>
    </div>
  );
}
