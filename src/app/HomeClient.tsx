"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatDate, formatPrice } from "@/lib/utils";
import { useSite } from "@/components/SiteProvider";
import { StoreFooter, StoreHeader } from "@/components/StoreChrome";

interface Drop {
  id: string;
  title: string;
  description: string | null;
  orderOpenAt: string;
  orderCloseAt: string;
  status: string;
  pickupSlots: { id: string; label: string; pickupDate: string }[];
  dropProducts: {
    id: string;
    quantityLimit: number | null;
    quantitySold: number;
    priceOverride: number | null;
    product: {
      id: string;
      name: string;
      price: number;
      imageUrl: string | null;
    };
  }[];
}

export default function HomeClient() {
  const site = useSite();
  const [drops, setDrops] = useState<Drop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDrops() {
      try {
        const res = await fetch("/api/drops");
        if (!res.ok) { setDrops([]); return; }
        const data = await res.json();
        if (Array.isArray(data)) {
          setDrops(data.filter((d: Drop) => d.status === "OPEN" || d.status === "DRAFT"));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchDrops();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <StoreHeader />

      {/* Hero */}
      <header className="bg-[#FAFAF8] border-b border-stone-100">
        <div className="max-w-5xl mx-auto px-4 py-16 md:py-24 text-center">
          <p className="text-amber-600 text-sm font-semibold tracking-wide uppercase mb-3">
            {site.SITE_TAGLINE}
          </p>
          <h1 className="text-4xl md:text-6xl font-bold text-stone-900 tracking-tight leading-tight">
            {site.SITE_HEADLINE}
          </h1>
          <p className="mt-4 text-stone-500 text-base md:text-lg max-w-xl mx-auto leading-relaxed whitespace-pre-line">
            {site.SITE_INTRO}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="#drops"
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-2.5 rounded-full text-sm transition-colors shadow-sm"
            >
              View This Week&apos;s Drop
            </a>
            <Link
              href="/farmstand"
              className="border border-stone-300 hover:border-stone-400 text-stone-700 font-semibold px-6 py-2.5 rounded-full text-sm transition-colors"
            >
              {site.SITE_FARMSTAND_HEADING}
            </Link>
          </div>
        </div>
      </header>

      {site.SITE_ABOUT && (
        <section className="max-w-3xl mx-auto px-4 pt-12 text-center">
          <p className="text-stone-600 leading-relaxed whitespace-pre-line">{site.SITE_ABOUT}</p>
        </section>
      )}

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-12" id="drops">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight">
            {site.SITE_DROPS_HEADING}
          </h2>
          <p className="text-sm text-stone-500 mt-1">
            {site.SITE_DROPS_BLURB}
          </p>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block w-6 h-6 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
            <p className="text-sm text-stone-400 mt-3">Loading drops...</p>
          </div>
        ) : drops.length === 0 ? (
          <div className="bg-[#FAFAF8] rounded-2xl p-12 text-center border border-stone-100">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🌾</span>
            </div>
            <h3 className="font-semibold text-stone-900 text-lg">
              No active drops right now
            </h3>
            <p className="text-stone-500 text-sm mt-2 max-w-sm mx-auto">
              The next drop will be posted soon. Check the farmstand for
              what&apos;s available now!
            </p>
            <Link
              href="/farmstand"
              className="inline-block mt-6 bg-amber-600 hover:bg-amber-700 text-white font-semibold px-5 py-2 rounded-full text-sm transition-colors"
            >
              Visit Farmstand →
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {drops.map((drop) => {
              const isOpen = drop.status === "OPEN";
              return (
                <div
                  key={drop.id}
                  className="bg-white rounded-2xl border border-stone-200 overflow-hidden hover:shadow-md transition-shadow duration-300"
                >
                  {/* Drop Header */}
                  <div className="p-6 md:p-8">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                              isOpen
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {isOpen ? "Ordering Open" : "Coming Soon"}
                          </span>
                        </div>
                        <h3 className="text-xl md:text-2xl font-bold text-stone-900">
                          {drop.title}
                        </h3>
                        {drop.description && (
                          <p className="text-sm text-stone-500 mt-1 leading-relaxed">
                            {drop.description}
                          </p>
                        )}
                      </div>
                      <div className="text-right text-xs text-stone-400">
                        <div>
                          Closes{" "}
                          <span className="font-medium text-stone-600">
                            {formatDate(drop.orderCloseAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Pickup Slots */}
                    {drop.pickupSlots.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-5">
                        {drop.pickupSlots.map((slot) => (
                          <span
                            key={slot.id}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 bg-stone-50 px-3 py-1.5 rounded-full"
                          >
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                            {slot.label}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Product Preview Grid */}
                    {drop.dropProducts.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {drop.dropProducts.slice(0, 4).map((dp) => (
                          <div
                            key={dp.id}
                            className="bg-[#FAFAF8] rounded-xl p-3 text-center"
                          >
                            {dp.product.imageUrl ? (
                              <div className="relative w-full aspect-square rounded-lg overflow-hidden mb-2">
                                <Image
                                  src={dp.product.imageUrl}
                                  alt={dp.product.name}
                                  fill
                                  className="object-cover"
                                />
                              </div>
                            ) : (
                              <div className="w-full aspect-square rounded-lg bg-stone-100 flex items-center justify-center mb-2">
                                <span className="text-2xl">🛍️</span>
                              </div>
                            )}
                            <p className="text-xs font-medium text-stone-800 truncate">
                              {dp.product.name}
                            </p>
                            <p className="text-xs text-amber-600 font-semibold mt-0.5">
                              {formatPrice(
                                dp.priceOverride ?? dp.product.price
                              )}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Drop Footer CTA */}
                  <div className="border-t border-stone-100 px-6 md:px-8 py-4 flex items-center justify-between bg-[#FAFAF8]">
                    <span className="text-xs text-stone-400">
                      {drop.dropProducts.length} items available
                    </span>
                    <Link
                      href={`/drops/${drop.id}`}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-5 py-2 rounded-full text-sm transition-colors"
                    >
                      {isOpen ? "Order Now →" : "View Menu →"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <StoreFooter />
    </div>
  );
}
