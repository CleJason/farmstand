import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteSettings, standHref } from "@/lib/site";
import WalkUpShop from "@/components/WalkUpShop";

// The walk-up page at the owner's chosen address (Admin → Site), e.g. /porch-pickup.
// Built-in pages (/admin, /gift…) always win over this route.

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteSettings();
  return { title: site.SITE_FARMSTAND_HEADING };
}

export default async function CustomStandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getSiteSettings();
  if (`/${slug.toLowerCase()}` !== standHref(site)) notFound();
  return <WalkUpShop />;
}
