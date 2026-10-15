"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatDate, formatPrice } from "@/lib/utils";
import { useSite, useText } from "@/components/SiteProvider";
import { standHref } from "@/lib/site-defaults";
import { StoreHeader } from "@/components/StoreChrome";
import SocialLinks from "@/components/SocialLinks";
import ReviewsSection from "@/components/ReviewsSection";
import LegalFooter from "@/components/LegalFooter";
import DropAlertsSignup from "@/components/DropAlertsSignup";
import StandHours from "@/components/StandHours";

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
      imagePosition: string | null;
    };
  }[];
}

export default function HomeClient() {
  const site = useSite();
  const text = useText();
  const stand = standHref(site);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState<{ average: number; count: number } | null>(null);

  useEffect(() => {
    async function fetchDrops() {
      try {
        const res = await fetch("/api/drops");
        if (!res.ok) { setDrops([]); return; }
        const data = await res.json();
        if (Array.isArray(data)) {
          // Published drops that haven't closed yet (ones opening later show as Coming Soon)
          setDrops(data.filter((d: Drop) => d.status === "OPEN" && new Date(d.orderCloseAt) > new Date()));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchDrops();
    // Average star rating shown under the shop name
    fetch("/api/reviews")
      .then((r) => (r.ok ? r.json() : []))
      .then((reviews: { rating: number; visible?: boolean }[]) => {
        const shown = Array.isArray(reviews) ? reviews.filter((r) => r.visible !== false) : [];
        if (shown.length) {
          setRating({ average: shown.reduce((s, r) => s + r.rating, 0) / shown.length, count: shown.length });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <StoreHeader />

      {/* Hero: warm wash of the brand color with soft glows behind the text */}
      <header className="relative overflow-hidden border-b border-amber-100 bg-gradient-to-b from-amber-50 via-[#FFFDF9] to-white">
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-amber-300/25 blur-3xl" />
        <div
          className={`relative max-w-5xl mx-auto px-4 text-center ${
            site.SITE_COVER_URL ? "pt-6 pb-14 md:pt-8 md:pb-20" : "py-16 md:py-24"
          }`}
        >
          {site.SITE_COVER_URL && (
            <div className="relative w-full aspect-[16/9] sm:aspect-[21/8] rounded-3xl overflow-hidden shadow-xl shadow-amber-900/10 ring-1 ring-black/5 mb-10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={site.SITE_COVER_URL}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ objectPosition: site.SITE_COVER_POSITION || undefined }}
              />
            </div>
          )}
          <p className="inline-block text-amber-700 bg-white/70 border border-amber-200 text-xs font-semibold tracking-wider uppercase rounded-full px-3.5 py-1 mb-5 shadow-sm">
            {site.SITE_TAGLINE}
          </p>
          <h1 className="text-4xl md:text-6xl font-bold text-stone-900 tracking-tight leading-tight">
            {site.SITE_HEADLINE}
          </h1>
          {rating && (
            <a
              href="#reviews"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900"
            >
              <span className="font-semibold text-stone-900">{rating.average.toFixed(1)}</span>
              <span className="text-amber-500" aria-hidden>
                ★
              </span>
              <span className="underline-offset-2 hover:underline">
                {text("home.reviewCount", { count: rating.count })}
              </span>
            </a>
          )}
          <div aria-hidden className="mx-auto mt-4 h-1 w-16 rounded-full bg-amber-500/80" />
          <p className="mt-5 text-stone-600 text-base md:text-lg max-w-xl mx-auto leading-relaxed whitespace-pre-line">
            {site.SITE_INTRO}
          </p>
          {site.SITE_PICKUP_AREA && (
            <p className="mt-6 inline-flex items-center gap-1.5 text-stone-800 text-lg md:text-xl font-semibold bg-white/80 border border-stone-200 rounded-full px-4 py-1.5 shadow-sm">
              <span aria-hidden>📍</span> {site.SITE_PICKUP_AREA}
            </p>
          )}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="#drops"
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-7 py-3 rounded-full text-sm shadow-md shadow-amber-600/25 hover:-translate-y-0.5 transition-all"
            >
              {text("home.viewDrops")}
            </a>
            <Link
              href={stand}
              className="bg-white border border-stone-300 hover:border-amber-400 text-stone-800 font-semibold px-7 py-3 rounded-full text-sm shadow-sm hover:-translate-y-0.5 transition-all"
            >
              {site.SITE_FARMSTAND_HEADING}
            </Link>
          </div>
          <StandHours compact />
          <SocialLinks className="mt-7" />
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
          <h2 className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">
            {site.SITE_DROPS_HEADING}
          </h2>
          <div aria-hidden className="mt-2 h-1 w-12 rounded-full bg-amber-500/80" />
          <p className="text-sm text-stone-500 mt-3">
            {site.SITE_DROPS_BLURB}
          </p>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block w-6 h-6 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
            <p className="text-sm text-stone-400 mt-3">{text("home.loadingDrops")}</p>
          </div>
        ) : drops.length === 0 ? (
          <div className="rounded-3xl p-12 text-center border-2 border-dashed border-amber-200 bg-gradient-to-br from-amber-50/80 to-white">
            <div className="w-16 h-16 bg-white shadow-sm border border-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🗓️</span>
            </div>
            <h3 className="font-semibold text-stone-900 text-lg">
              {text("home.noDropsTitle")}
            </h3>
            <p className="text-stone-500 text-sm mt-2 max-w-sm mx-auto">
              {text("home.noDropsText", { stand: site.SITE_FARMSTAND_HEADING })}
            </p>
            <Link
              href={stand}
              className="inline-block mt-6 bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-2.5 rounded-full text-sm shadow-md shadow-amber-600/25 hover:-translate-y-0.5 transition-all"
            >
              {text("home.visitStand", { stand: site.SITE_FARMSTAND_HEADING })}
            </Link>
            <a href="#alerts" className="block mt-3 text-sm font-semibold text-amber-700 hover:underline">
              {text("home.alertsLink")}
            </a>
          </div>
        ) : (
          <div className="space-y-6">
            {drops.map((drop) => {
              const isOpen = new Date(drop.orderOpenAt) <= new Date();
              return (
                <div
                  key={drop.id}
                  className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
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
                            {isOpen ? text("home.badgeOpen") : text("home.badgeSoon")}
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
                          {isOpen ? text("home.closes") : text("home.opens")}{" "}
                          <span className="font-medium text-stone-600">
                            {formatDate(isOpen ? drop.orderCloseAt : drop.orderOpenAt)}
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
                        {drop.dropProducts.map((dp) => (
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
                                  style={{ objectPosition: dp.product.imagePosition || undefined }}
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
                      {text("home.itemsAvailable", { count: drop.dropProducts.length })}
                    </span>
                    <Link
                      href={`/drops/${drop.id}`}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-5 py-2 rounded-full text-sm transition-colors"
                    >
                      {isOpen ? text("home.orderNow") : text("home.viewMenu")}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <ReviewsSection />
      <DropAlertsSignup />
      <LegalFooter />
    </div>
  );
}
