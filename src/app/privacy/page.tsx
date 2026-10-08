import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/site";
import { defaultPrivacy } from "@/lib/legal";
import { StoreHeader } from "@/components/StoreChrome";
import LegalFooter from "@/components/LegalFooter";
import LegalText from "@/components/LegalText";

export const metadata: Metadata = { title: "Privacy Policy" };

export default async function PrivacyPage() {
  const site = await getSiteSettings();
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <StoreHeader />
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-stone-900 tracking-tight mb-6">Privacy Policy</h1>
        <LegalText text={site.SITE_PRIVACY || defaultPrivacy(site)} />
      </main>
      <LegalFooter />
    </div>
  );
}
