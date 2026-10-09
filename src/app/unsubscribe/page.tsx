import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

export const metadata = { title: "Unsubscribe", robots: { index: false } };

async function unsubscribe(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  if (token) await prisma.subscriber.deleteMany({ where: { unsubscribeToken: token } });
  redirect("/unsubscribe?done=1");
}

/**
 * The link at the bottom of every drop alert. It asks for a click rather than
 * unsubscribing on open, because email scanners open links on their own.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string }>;
}) {
  await connection();
  const { token, done } = await searchParams;
  const [site, subscriber] = await Promise.all([
    getSiteSettings(),
    token ? prisma.subscriber.findUnique({ where: { unsubscribeToken: String(token) } }) : null,
  ]);

  let heading: string;
  let body: string;
  if (done) {
    heading = "You're unsubscribed";
    body = `You won't get any more drop alerts from ${site.SITE_NAME}.`;
  } else if (subscriber) {
    heading = "Stop drop alerts?";
    body = `${subscriber.email} will no longer hear about new drops from ${site.SITE_NAME}.`;
  } else {
    heading = "Already unsubscribed";
    body = "This link has already been used, or the address isn't on the list.";
  }

  return (
    <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-6 text-center">
      <div className="max-w-md bg-white p-8 rounded-2xl shadow-sm border border-stone-200 space-y-4">
        <h1 className="text-2xl font-bold text-stone-900">{heading}</h1>
        <p className="text-stone-600 text-sm">{body}</p>
        {subscriber && !done ? (
          <form action={unsubscribe} className="flex flex-col gap-2">
            <input type="hidden" name="token" value={token} />
            <button className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-2.5 rounded-full text-sm">
              Unsubscribe
            </button>
            <Link href="/" className="text-sm text-stone-500 hover:text-stone-800">
              Keep me on the list
            </Link>
          </form>
        ) : (
          <Link href="/" className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-2.5 rounded-full text-sm">
            Back to {site.SITE_NAME}
          </Link>
        )}
      </div>
    </div>
  );
}
