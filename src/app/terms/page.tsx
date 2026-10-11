import type { Metadata } from "next";
import Link from "next/link";
import { getSiteSettings } from "@/lib/site";
import { defaultTerms } from "@/lib/legal";
import { StoreHeader } from "@/components/StoreChrome";
import LegalFooter from "@/components/LegalFooter";
import LegalText from "@/components/LegalText";
import LastUpdated from "@/components/LastUpdated";
import { textFor } from "@/lib/copy";

export const metadata: Metadata = { title: "Terms" };

export default async function TermsPage() {
  const site = await getSiteSettings();
  const text = textFor(site);
  const updated = site.SITE_TERMS && site.SITE_TERMS_UPDATED;
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <StoreHeader />
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-10">
        <Link href="/" className="inline-block text-sm text-amber-700 font-semibold hover:underline mb-4">
          {text("legal.back")}
        </Link>
        <h1 className="text-2xl font-bold text-stone-900 tracking-tight">{text("footer.terms")}</h1>
        {updated && <LastUpdated date={updated} />}
        <div className="mt-6">
          <LegalText text={site.SITE_TERMS || defaultTerms(site)} />
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
