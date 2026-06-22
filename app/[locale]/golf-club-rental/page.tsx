'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Layout } from '@/app/[locale]/(features)/bookings/components/booking/Layout';
import { getPremiumClubPricing, getPremiumPlusClubPricing } from '@/types/golf-club-rental';
import { usePricingLoader } from '@/lib/pricing-hook';
import { CheckIcon } from '@heroicons/react/24/outline';

const STORAGE_BASE = 'https://bisimqmtxjsptehhqpeg.supabase.co/storage/v1/object/public/website-assets';

export default function GolfClubRentalPage() {
  const t = useTranslations('clubRental');
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null);
  usePricingLoader();
  const PREMIUM_CLUB_PRICING = getPremiumClubPricing();
  const PREMIUM_PLUS_CLUB_PRICING = getPremiumPlusClubPricing();

  const HERO_IMAGES = [
    { src: `${STORAGE_BASE}/clubs/premium-plus/2.png`, alt: t('hero.imgFullSetAlt') },
    { src: `${STORAGE_BASE}/clubs/premium-plus/4.png`, alt: t('hero.imgDriverAlt') },
    { src: `${STORAGE_BASE}/clubs/premium-plus/11.png`, alt: t('hero.imgIronsAlt') },
    { src: `${STORAGE_BASE}/clubs/premium-plus/15.png`, alt: t('hero.imgPutterAlt') },
  ];

  const ALL_PARADYM_IMAGES = Array.from({ length: 18 }, (_, i) => ({
    src: `${STORAGE_BASE}/clubs/premium-plus/${i + 1}.png`,
    alt: t('hero.galleryPhotoAlt', { index: i + 1 }),
  }));

  return (
    <Layout>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-block bg-green-100 text-green-800 text-xs sm:text-sm font-medium px-3 sm:px-4 py-1 sm:py-1.5 rounded-full mb-3 sm:mb-4">
            {t('hero.badge')}
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">
            <span className="text-green-700">{t('hero.titleGreen')}</span>
            <span className="text-gray-900">{t('hero.titleBlack')}</span>
          </h1>
          <p className="text-sm sm:text-lg text-gray-600 max-w-3xl mx-auto">
            {t('hero.subtitle')}
          </p>
        </div>

        {/* Course Rental — prominent top banner with course hero image */}
        <div className="mb-8 sm:mb-10 max-w-6xl mx-auto">
          <div className="rounded-xl shadow-lg overflow-hidden relative" style={{ backgroundColor: '#003d1f' }}>
            {/* Background course image */}
            <div className="absolute inset-0">
              <Image
                src={`${STORAGE_BASE}/golf/hero-course-rental.webp`}
                alt={t('courseBanner.bgAlt')}
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1200px) 100vw, 1152px"
              />
              {/* Gradient overlay for text legibility */}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(0,61,31,0.92) 0%, rgba(0,61,31,0.78) 45%, rgba(0,61,31,0.35) 100%)' }} />
            </div>

            <div className="relative p-5 sm:p-7 lg:p-9 flex flex-col md:flex-row md:items-center gap-4 md:gap-6 min-h-[220px] sm:min-h-[240px]">
              <div className="flex-1 min-w-0 max-w-xl">
                <div className="inline-block bg-white/20 text-white text-[11px] sm:text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full mb-2 sm:mb-3 backdrop-blur-sm">
                  {t('courseBanner.kicker')}
                </div>
                <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-1.5 sm:mb-2 leading-tight drop-shadow-sm">
                  {t('courseBanner.heading')}
                </h2>
                <p className="text-sm sm:text-base text-white/90 mb-3 sm:mb-4 drop-shadow-sm">
                  {t('courseBanner.body')}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="/course-rental"
                    className="inline-flex items-center gap-2 bg-white hover:bg-gray-100 px-5 py-2.5 sm:px-6 sm:py-3 rounded-lg font-bold text-sm sm:text-base transition-colors shadow-lg"
                    style={{ color: '#003d1f' }}
                  >
                    {t('courseBanner.primaryCta')}
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                  <Link
                    href="/course-rental"
                    className="inline-flex items-center gap-1.5 text-white/95 hover:text-white px-2 py-2.5 sm:py-3 text-sm sm:text-base font-medium underline underline-offset-4 decoration-white/50 hover:decoration-white transition-colors"
                  >
                    {t('courseBanner.secondaryCta')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hero Image Gallery - clickable */}
        <div className="mb-8 sm:mb-10 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 max-w-4xl mx-auto">
          {HERO_IMAGES.map((img) => {
            const fullIndex = ALL_PARADYM_IMAGES.findIndex(p => p.src === img.src);
            return (
            <button
              key={img.alt}
              type="button"
              onClick={() => setCarouselIndex(fullIndex >= 0 ? fullIndex : 0)}
              className="relative aspect-square rounded-lg sm:rounded-xl overflow-hidden bg-gray-50 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-green-300 transition-all duration-200 group"
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                className="object-contain p-1.5 sm:p-2 group-hover:scale-105 transition-transform duration-200"
                loading="lazy"
                sizes="(max-width: 640px) 33vw, 200px"
              />
            </button>
            );
          })}
        </div>

        {/* Lightbox Modal */}
        {carouselIndex !== null && (() => {
          const current = ALL_PARADYM_IMAGES[carouselIndex];
          return (
          <div
            className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center"
            onClick={() => setCarouselIndex(null)}
          >
            {/* Close */}
            <button
              onClick={() => setCarouselIndex(null)}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 z-10"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Counter */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-xs sm:text-sm font-medium">
              {carouselIndex + 1} / {ALL_PARADYM_IMAGES.length}
            </div>

            {/* Main image */}
            <div className="flex-1 flex items-center justify-center w-full px-12 sm:px-20" onClick={(e) => e.stopPropagation()}>
              <Image
                src={current.src}
                alt={current.alt}
                width={800}
                height={600}
                className="max-w-full max-h-[70vh] object-contain"
                unoptimized
              />
            </div>

            {/* Caption */}
            <div className="text-white/80 text-xs sm:text-sm mb-2">{current.alt}</div>

            {/* Prev / Next */}
            <button
              onClick={(e) => { e.stopPropagation(); setCarouselIndex((carouselIndex - 1 + ALL_PARADYM_IMAGES.length) % ALL_PARADYM_IMAGES.length); }}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 sm:p-3"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setCarouselIndex((carouselIndex + 1) % ALL_PARADYM_IMAGES.length); }}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 sm:p-3"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Thumbnail strip */}
            <div className="flex gap-1.5 pb-4 pt-2 overflow-x-auto max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
              {ALL_PARADYM_IMAGES.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCarouselIndex(i)}
                  className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded overflow-hidden border-2 transition-colors ${
                    i === carouselIndex ? 'border-white' : 'border-transparent opacity-50 hover:opacity-80'
                  }`}
                >
                  <Image src={img.src} alt={img.alt} width={48} height={48} className="w-full h-full object-contain bg-white/10 p-0.5" />
                </button>
              ))}
            </div>
          </div>
          );
        })()}

        {/* Club Upgrade Pricing Table */}
        <div className="mb-8 sm:mb-12">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6 text-center">
            {t('pricingTable.heading')}
          </h2>
          <div className="max-w-3xl mx-auto overflow-hidden rounded-lg sm:rounded-xl border-2 border-gray-200">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="py-2.5 sm:py-3 px-3 sm:px-4 text-left text-xs sm:text-sm font-semibold text-gray-700 bg-gray-50">{t('pricingTable.durationHeader')}</th>
                  <th className="py-2.5 sm:py-3 px-3 sm:px-4 text-center text-xs sm:text-sm font-semibold text-green-700 bg-gray-50">{t('pricingTable.premiumHeader')}</th>
                  <th className="py-2.5 sm:py-3 px-3 sm:px-4 text-center text-xs sm:text-sm font-semibold text-white" style={{ backgroundColor: '#003d1f' }}>{t('pricingTable.premiumPlusHeader')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {PREMIUM_CLUB_PRICING.map((premium, i) => {
                  const premiumPlus = PREMIUM_PLUS_CLUB_PRICING[i];
                  return (
                    <tr key={premium.duration}>
                      <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-xs sm:text-sm font-medium text-gray-900">{t('pricingTable.durationValue', { hours: premium.duration })}</td>
                      <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-center text-base sm:text-lg font-bold text-green-600">฿{premium.price.toLocaleString()}</td>
                      <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-center text-base sm:text-lg font-bold" style={{ color: '#003d1f', backgroundColor: 'rgba(0,61,31,0.05)' }}>฿{premiumPlus.price.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-center text-xs sm:text-sm text-gray-600 mt-3 sm:mt-4">
            {t('pricingTable.footnote')}
          </p>
        </div>

        {/* Available Golf Club Sets - 3 Tiers */}
        <div className="mb-8 sm:mb-12">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6 text-center">
            {t('sets.sectionHeading')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto">
            {/* Standard Clubs */}
            <div className="bg-gray-50 rounded-xl shadow-sm border-2 border-gray-300 p-4 sm:p-6 opacity-75 flex flex-col">
              <h3 className="text-lg sm:text-xl font-bold text-gray-600 mb-1 sm:mb-2">
                {t('sets.standardTitle')}
              </h3>
              <p className="text-base sm:text-lg font-semibold text-gray-500 mb-1 sm:mb-2">
                {t('sets.standardSubtitle')}
              </p>
              <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">
                {t('sets.standardDescription')}
              </p>

              <div className="mb-4 sm:mb-6 flex-1">
                <p className="font-semibold text-gray-600 mb-2 text-sm">{t('sets.includesLabel')}</p>
                <ul className="space-y-1">
                  <li className="flex items-start text-xs sm:text-sm text-gray-500">
                    <CheckIcon className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{t('sets.standardItemDriver')}</span>
                  </li>
                  <li className="flex items-start text-xs sm:text-sm text-gray-500">
                    <CheckIcon className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{t('sets.standardItemIrons')}</span>
                  </li>
                  <li className="flex items-start text-xs sm:text-sm text-gray-500">
                    <CheckIcon className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{t('sets.standardItemPutter')}</span>
                  </li>
                  <li className="flex items-start text-xs sm:text-sm text-gray-500">
                    <CheckIcon className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{t('sets.standardItemBag')}</span>
                  </li>
                </ul>
              </div>

              <div className="text-center py-2.5 sm:py-3 px-4 rounded-lg bg-gray-200 text-gray-500 font-semibold text-sm mt-auto">
                {t('sets.standardCta')}
              </div>
            </div>

            {/* Premium Clubs */}
            <div className="bg-white rounded-xl shadow-lg border-2 border-green-500 p-4 sm:p-6 relative flex flex-col">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-1 rounded-full text-xs sm:text-sm font-semibold">
                {t('sets.premiumBadge')}
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-green-800 mb-1 sm:mb-2">
                {t('sets.premiumTitle')}
              </h3>
              <p className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">
                {t('sets.premiumSubtitle')}
              </p>

              <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6 flex-1">
                <div className="border-l-4 border-green-500 pl-3 sm:pl-4">
                  <h4 className="font-semibold text-gray-800 text-sm">{t('sets.premiumMensTitle')}</h4>
                  <p className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">{t('sets.premiumMensDescription')}</p>
                  <ul className="space-y-1">
                    <li className="flex items-start text-xs sm:text-sm text-gray-600">
                      <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span>{t('sets.premiumMensSpecs')}</span>
                    </li>
                    <li className="flex items-start text-xs sm:text-sm text-gray-600">
                      <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span>{t('sets.premiumMensBag')}</span>
                    </li>
                  </ul>
                </div>

                <div className="border-l-4 border-green-500 pl-3 sm:pl-4">
                  <h4 className="font-semibold text-gray-800 text-sm">{t('sets.premiumWomensTitle')}</h4>
                  <p className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">{t('sets.premiumWomensDescription')}</p>
                  <ul className="space-y-1">
                    <li className="flex items-start text-xs sm:text-sm text-gray-600">
                      <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span>{t('sets.premiumWomensSpecs')}</span>
                    </li>
                    <li className="flex items-start text-xs sm:text-sm text-gray-600">
                      <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span>{t('sets.premiumWomensBag')}</span>
                    </li>
                  </ul>
                </div>
              </div>

              <Link
                href="/bookings"
                className="w-full block text-center py-2.5 sm:py-3 px-4 rounded-lg font-semibold transition-colors bg-green-600 hover:bg-green-700 text-white text-sm sm:text-base mt-auto"
              >
                {t('sets.premiumCta')}
              </Link>
            </div>

            {/* Premium+ Clubs - Standout dark green + white */}
            <div className="rounded-xl shadow-lg border-2 border-white/20 p-4 sm:p-6 relative flex flex-col" style={{ backgroundColor: '#003d1f' }}>
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-white px-4 py-1 rounded-full text-xs sm:text-sm font-semibold" style={{ color: '#003d1f' }}>
                {t('sets.premiumPlusBadge')}
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-white mb-1 sm:mb-2">
                {t('sets.premiumPlusTitle')}
              </h3>
              <p className="text-base sm:text-lg font-semibold text-white/80 mb-3 sm:mb-4">
                {t('sets.premiumPlusSubtitle')}
              </p>

              {/* Paradym images - 3-up grid, opens full carousel */}
              <div className="grid grid-cols-3 gap-1.5 mb-3 sm:mb-4">
                {[3, 10, 1].map((imgNum) => (
                  <button
                    key={imgNum}
                    type="button"
                    onClick={() => setCarouselIndex(imgNum - 1)}
                    className="relative aspect-square rounded-md overflow-hidden bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                  >
                    <Image
                      src={`${STORAGE_BASE}/clubs/premium-plus/${imgNum}.png`}
                      alt={t('sets.premiumPlusParadymAlt', { index: imgNum })}
                      fill
                      className="object-contain p-1"
                      loading="lazy"
                      sizes="100px"
                    />
                  </button>
                ))}
              </div>

              <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6 flex-1">
                <div className="border-l-4 border-white/40 pl-3 sm:pl-4">
                  <h4 className="font-semibold text-white text-sm">{t('sets.premiumPlusCardTitle')}</h4>
                  <p className="text-xs sm:text-sm text-white/70 mb-1 sm:mb-2">{t('sets.premiumPlusDescription')}</p>
                  <ul className="space-y-1">
                    <li className="flex items-start text-xs sm:text-sm text-white/90">
                      <CheckIcon className="h-4 w-4 text-white mr-2 mt-0.5 flex-shrink-0" />
                      <span>{t('sets.premiumPlusItem1')}</span>
                    </li>
                    <li className="flex items-start text-xs sm:text-sm text-white/90">
                      <CheckIcon className="h-4 w-4 text-white mr-2 mt-0.5 flex-shrink-0" />
                      <span>{t('sets.premiumPlusItem2')}</span>
                    </li>
                    <li className="flex items-start text-xs sm:text-sm text-white/90">
                      <CheckIcon className="h-4 w-4 text-white mr-2 mt-0.5 flex-shrink-0" />
                      <span>{t('sets.premiumPlusItem3')}</span>
                    </li>
                    <li className="flex items-start text-xs sm:text-sm text-white/90">
                      <CheckIcon className="h-4 w-4 text-white mr-2 mt-0.5 flex-shrink-0" />
                      <span>{t('sets.premiumPlusItem4')}</span>
                    </li>
                  </ul>
                </div>
              </div>

              <Link
                href="/bookings"
                className="w-full block text-center py-2.5 sm:py-3 px-4 rounded-lg font-semibold transition-colors mt-auto hover:opacity-90 bg-white text-sm sm:text-base"
                style={{ color: '#003d1f' }}
              >
                {t('sets.premiumPlusCta')}
              </Link>
            </div>
          </div>

          {/* Handedness note */}
          <div className="mx-auto mt-6 max-w-4xl rounded-lg border border-green-200 bg-green-50 px-4 sm:px-5 py-3 sm:py-4 text-sm">
            <p className="font-semibold text-green-800">{t('sets.handednessNoteTitle')}</p>
            <p className="mt-1 text-gray-700">{t('sets.handednessNote')}</p>
          </div>
        </div>

        {/* Why Choose LENGOLF Section */}
        <div className="bg-green-50 rounded-xl p-4 sm:p-6 mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-green-800 mb-3 sm:mb-4">
            {t('why.heading')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">{t('why.feature1Title')}</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                {t('why.feature1Body')}
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">{t('why.feature2Title')}</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                {t('why.feature2Body')}
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">{t('why.feature3Title')}</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                {t('why.feature3Body')}
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">{t('why.feature4Title')}</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                {t('why.feature4Body')}
              </p>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mb-8 sm:mb-12">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6">{t('faq.heading')}</h2>
          <div className="space-y-3 sm:space-y-4 max-w-3xl mx-auto">
            <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">{t('faq.q1Title')}</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                {t('faq.q1Body')}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">{t('faq.q2Title')}</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                {t('faq.q2Body')}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">{t('faq.q3Title')}</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                {t('faq.q3Body')}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">{t('faq.q4Title')}</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                {t('faq.q4BodyBefore')}
                <Link
                  href="/course-rental"
                  className="text-green-600 hover:text-green-700 underline font-medium"
                >
                  {t('faq.q4Link')}
                </Link>
                {t('faq.q4BodyAfter')}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">{t('faq.q5Title')}</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                {t('faq.q5Body')}
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-gray-50 rounded-xl p-4 sm:p-6 text-center">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">
            {t('cta.heading')}
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 mb-2">
            {t('cta.body')}
          </p>
          <a
            href="https://maps.app.goo.gl/pDyzGarizSvYz11G8"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 hover:text-green-600 transition-colors"
          >
            {t('cta.address')}
          </a>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <Link
              href="/bookings"
              className="bg-green-600 hover:bg-green-700 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition-colors text-sm sm:text-base"
            >
              {t('cta.bookCta')}
            </Link>
            <a
              href="https://lin.ee/uxQpIXn"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-600 hover:bg-gray-700 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition-colors text-sm sm:text-base"
            >
              {t('cta.contactCta')}
            </a>
          </div>
        </div>
      </div>
    </Layout>
  );
}
