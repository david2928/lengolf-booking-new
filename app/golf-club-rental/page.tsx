'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Layout } from '@/app/(features)/bookings/components/booking/Layout';
import { getPremiumClubPricing, getPremiumPlusClubPricing } from '@/types/golf-club-rental';
import { usePricingLoader } from '@/lib/pricing-hook';
import { CheckIcon } from '@heroicons/react/24/outline';

const STORAGE_BASE = 'https://bisimqmtxjsptehhqpeg.supabase.co/storage/v1/object/public/website-assets';

const HERO_IMAGES = [
  { src: `${STORAGE_BASE}/clubs/premium-plus/2.png`, alt: 'Callaway Paradym full set in bag' },
  { src: `${STORAGE_BASE}/clubs/premium-plus/4.png`, alt: 'Callaway Paradym driver' },
  { src: `${STORAGE_BASE}/clubs/premium-plus/11.png`, alt: 'Callaway Paradym irons' },
  { src: `${STORAGE_BASE}/clubs/premium-plus/15.png`, alt: 'Odyssey putter' },
];

const ALL_PARADYM_IMAGES = Array.from({ length: 18 }, (_, i) => ({
  src: `${STORAGE_BASE}/clubs/premium-plus/${i + 1}.png`,
  alt: `Callaway Paradym Forged Carbon - Photo ${i + 1}`,
}));

export default function GolfClubRentalPage() {
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null);
  usePricingLoader();
  const PREMIUM_CLUB_PRICING = getPremiumClubPricing();
  const PREMIUM_PLUS_CLUB_PRICING = getPremiumPlusClubPricing();

  return (
    <Layout>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-block bg-green-100 text-green-800 text-xs sm:text-sm font-medium px-3 sm:px-4 py-1 sm:py-1.5 rounded-full mb-3 sm:mb-4">
            For use in your LENGOLF bay
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">
            <span className="text-green-700">Premium Clubs,</span>
            <span className="text-gray-900"> No Commitment</span>
          </h1>
          <p className="text-sm sm:text-lg text-gray-600 max-w-3xl mx-auto">
            Free standard sets with every booking. Upgrade to Callaway Warbird, Majesty Shuttle, or Callaway Paradym for the ultimate simulator experience.
          </p>
        </div>

        {/* Course Rental — prominent top banner with course hero image */}
        <div className="mb-8 sm:mb-10 max-w-6xl mx-auto">
          <div className="rounded-xl shadow-lg overflow-hidden relative" style={{ backgroundColor: '#003d1f' }}>
            {/* Background course image */}
            <div className="absolute inset-0">
              <Image
                src={`${STORAGE_BASE}/golf/hero-course-rental.webp`}
                alt="Rent premium golf clubs for Bangkok golf courses"
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
                  Playing a real course?
                </div>
                <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-1.5 sm:mb-2 leading-tight drop-shadow-sm">
                  Rent Premium Clubs for Your Round
                </h2>
                <p className="text-sm sm:text-base text-white/90 mb-3 sm:mb-4 drop-shadow-sm">
                  Warbird, Shuttle &amp; Paradym sets &middot; <span className="font-semibold text-white">From ฿1,200/day</span> &middot; Delivery anywhere in Bangkok
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="/course-rental"
                    className="inline-flex items-center gap-2 bg-white hover:bg-gray-100 px-5 py-2.5 sm:px-6 sm:py-3 rounded-lg font-bold text-sm sm:text-base transition-colors shadow-lg"
                    style={{ color: '#003d1f' }}
                  >
                    Book Course Rental
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                  <Link
                    href="/course-rental"
                    className="inline-flex items-center gap-1.5 text-white/95 hover:text-white px-2 py-2.5 sm:py-3 text-sm sm:text-base font-medium underline underline-offset-4 decoration-white/50 hover:decoration-white transition-colors"
                  >
                    See pricing &amp; details
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
            Club Upgrade Pricing
          </h2>
          <div className="max-w-3xl mx-auto overflow-hidden rounded-lg sm:rounded-xl border-2 border-gray-200">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="py-2.5 sm:py-3 px-3 sm:px-4 text-left text-xs sm:text-sm font-semibold text-gray-700 bg-gray-50">Duration</th>
                  <th className="py-2.5 sm:py-3 px-3 sm:px-4 text-center text-xs sm:text-sm font-semibold text-green-700 bg-gray-50">Premium</th>
                  <th className="py-2.5 sm:py-3 px-3 sm:px-4 text-center text-xs sm:text-sm font-semibold text-white" style={{ backgroundColor: '#003d1f' }}>Premium+</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {PREMIUM_CLUB_PRICING.map((premium, i) => {
                  const premiumPlus = PREMIUM_PLUS_CLUB_PRICING[i];
                  return (
                    <tr key={premium.duration}>
                      <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-xs sm:text-sm font-medium text-gray-900">{premium.displayText}</td>
                      <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-center text-base sm:text-lg font-bold text-green-600">฿{premium.price.toLocaleString()}</td>
                      <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-center text-base sm:text-lg font-bold" style={{ color: '#003d1f', backgroundColor: 'rgba(0,61,31,0.05)' }}>฿{premiumPlus.price.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-center text-xs sm:text-sm text-gray-600 mt-3 sm:mt-4">
            Standard clubs are always free with any bay booking. In-bay use only.
          </p>
        </div>

        {/* Available Golf Club Sets - 3 Tiers */}
        <div className="mb-8 sm:mb-12">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6 text-center">
            Available Golf Club Sets
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto">
            {/* Standard Clubs */}
            <div className="bg-gray-50 rounded-xl shadow-sm border-2 border-gray-300 p-4 sm:p-6 opacity-75 flex flex-col">
              <h3 className="text-lg sm:text-xl font-bold text-gray-600 mb-1 sm:mb-2">
                Standard Set
              </h3>
              <p className="text-base sm:text-lg font-semibold text-gray-500 mb-1 sm:mb-2">
                House Set
              </p>
              <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">
                Men&apos;s &amp; Ladies&apos; sets included free with every bay booking
              </p>

              <div className="mb-4 sm:mb-6 flex-1">
                <p className="font-semibold text-gray-600 mb-2 text-sm">Includes:</p>
                <ul className="space-y-1">
                  <li className="flex items-start text-xs sm:text-sm text-gray-500">
                    <CheckIcon className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Driver</span>
                  </li>
                  <li className="flex items-start text-xs sm:text-sm text-gray-500">
                    <CheckIcon className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Irons (5&ndash;PW)</span>
                  </li>
                  <li className="flex items-start text-xs sm:text-sm text-gray-500">
                    <CheckIcon className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Putter</span>
                  </li>
                  <li className="flex items-start text-xs sm:text-sm text-gray-500">
                    <CheckIcon className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Golf bag included</span>
                  </li>
                </ul>
              </div>

              <div className="text-center py-2.5 sm:py-3 px-4 rounded-lg bg-gray-200 text-gray-500 font-semibold text-sm mt-auto">
                Free with Booking
              </div>
            </div>

            {/* Premium Clubs */}
            <div className="bg-white rounded-xl shadow-lg border-2 border-green-500 p-4 sm:p-6 relative flex flex-col">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-1 rounded-full text-xs sm:text-sm font-semibold">
                From ฿150/hr
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-green-800 mb-1 sm:mb-2">
                Premium Set
              </h3>
              <p className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">
                Callaway Warbird &amp; Majesty Shuttle
              </p>

              <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6 flex-1">
                <div className="border-l-4 border-green-500 pl-3 sm:pl-4">
                  <h4 className="font-semibold text-gray-800 text-sm">Men&apos;s &mdash; Callaway Warbird</h4>
                  <p className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Full set with Uniflex shafts</p>
                  <ul className="space-y-1">
                    <li className="flex items-start text-xs sm:text-sm text-gray-600">
                      <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span>Driver, 5-wood, Irons 5-9, PW, SW</span>
                    </li>
                    <li className="flex items-start text-xs sm:text-sm text-gray-600">
                      <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span>Premium Callaway golf bag</span>
                    </li>
                  </ul>
                </div>

                <div className="border-l-4 border-green-500 pl-3 sm:pl-4">
                  <h4 className="font-semibold text-gray-800 text-sm">Women&apos;s &mdash; Majesty Shuttle</h4>
                  <p className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Ladies flex with premium design</p>
                  <ul className="space-y-1">
                    <li className="flex items-start text-xs sm:text-sm text-gray-600">
                      <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span>12.5&deg; Driver, Irons 7-9, PW, 56&deg; SW</span>
                    </li>
                    <li className="flex items-start text-xs sm:text-sm text-gray-600">
                      <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span>Premium ladies golf bag</span>
                    </li>
                  </ul>
                </div>
              </div>

              <Link
                href="/bookings"
                className="w-full block text-center py-2.5 sm:py-3 px-4 rounded-lg font-semibold transition-colors bg-green-600 hover:bg-green-700 text-white text-sm sm:text-base mt-auto"
              >
                Book with Premium Clubs
              </Link>
            </div>

            {/* Premium+ Clubs - Standout dark green + white */}
            <div className="rounded-xl shadow-lg border-2 border-white/20 p-4 sm:p-6 relative flex flex-col" style={{ backgroundColor: '#003d1f' }}>
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-white px-4 py-1 rounded-full text-xs sm:text-sm font-semibold" style={{ color: '#003d1f' }}>
                From ฿250/hr
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-white mb-1 sm:mb-2">
                Premium+ Set
              </h3>
              <p className="text-base sm:text-lg font-semibold text-white/80 mb-3 sm:mb-4">
                Callaway Paradym Forged Carbon
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
                      alt={`Paradym photo ${imgNum}`}
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
                  <h4 className="font-semibold text-white text-sm">Callaway Paradym</h4>
                  <p className="text-xs sm:text-sm text-white/70 mb-1 sm:mb-2">Tour-level equipment</p>
                  <ul className="space-y-1">
                    <li className="flex items-start text-xs sm:text-sm text-white/90">
                      <CheckIcon className="h-4 w-4 text-white mr-2 mt-0.5 flex-shrink-0" />
                      <span>Driver (10.5&deg;) + 3W + 5W + 4H &mdash; Ventus TR shafts</span>
                    </li>
                    <li className="flex items-start text-xs sm:text-sm text-white/90">
                      <CheckIcon className="h-4 w-4 text-white mr-2 mt-0.5 flex-shrink-0" />
                      <span>Irons 5&ndash;PW &mdash; Tungsten weighted</span>
                    </li>
                    <li className="flex items-start text-xs sm:text-sm text-white/90">
                      <CheckIcon className="h-4 w-4 text-white mr-2 mt-0.5 flex-shrink-0" />
                      <span>Jaws Raw Wedges (52&deg;, 56&deg;)</span>
                    </li>
                    <li className="flex items-start text-xs sm:text-sm text-white/90">
                      <CheckIcon className="h-4 w-4 text-white mr-2 mt-0.5 flex-shrink-0" />
                      <span>Odyssey Putter + Callaway camo bag</span>
                    </li>
                  </ul>
                </div>
              </div>

              <Link
                href="/bookings"
                className="w-full block text-center py-2.5 sm:py-3 px-4 rounded-lg font-semibold transition-colors mt-auto hover:opacity-90 bg-white text-sm sm:text-base"
                style={{ color: '#003d1f' }}
              >
                Book with Premium+ Clubs
              </Link>
            </div>
          </div>
        </div>

        {/* Why Choose LENGOLF Section */}
        <div className="bg-green-50 rounded-xl p-4 sm:p-6 mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-green-800 mb-3 sm:mb-4">
            Why Choose LENGOLF Golf Club Rental?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">Premium Quality Equipment</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                Our rental clubs are high-quality models from top brands like Callaway and Majesty.
                All clubs are professionally maintained and cleaned after each use.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">Free Standard Sets</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                Every bay booking includes complimentary standard clubs at no extra charge.
                Upgrade to Premium or Premium+ anytime during your session.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">Flexible Duration</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                Rent premium clubs by the hour &mdash; 1, 2, or 4-hour options available.
                No minimum commitment, just upgrade any bay session.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">Easy Online Booking</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                Select your preferred clubs when booking your simulator bay online.
                No deposits required, just show up and play!
              </p>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mb-8 sm:mb-12">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6">Frequently Asked Questions</h2>
          <div className="space-y-3 sm:space-y-4 max-w-3xl mx-auto">
            <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">What&apos;s the difference between Standard, Premium, and Premium+?</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                Standard clubs are house sets included free with every booking. Premium sets feature Callaway Warbird (men&apos;s) and Majesty Shuttle (ladies&apos;) starting from ฿150/hr.
                Premium+ offers tour-level Callaway Paradym Forged Carbon clubs from ฿250/hr.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">Can tourists rent golf clubs at LENGOLF?</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                Yes! Our golf club rental service is perfect for tourists visiting Bangkok.
                No membership required &mdash; just book online and enjoy premium clubs during your visit.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">Do I need to reserve clubs in advance?</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                You can select your preferred clubs when booking your bay online, or simply request them when you arrive.
                Premium and Premium+ sets are subject to availability.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
              <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">Can I use the rental clubs outside of LENGOLF?</h3>
              <p className="text-xs sm:text-sm text-gray-700">
                The hourly rates on this page are for in-bay simulator use only. For taking clubs to a Bangkok golf course
                (daily rates from ฿1,200 with delivery available), see our{' '}
                <Link
                  href="/course-rental"
                  className="text-green-600 hover:text-green-700 underline font-medium"
                >
                  Golf Course Club Rental
                </Link> page.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-gray-50 rounded-xl p-4 sm:p-6 text-center">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">
            Ready to Play with Premium Clubs?
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 mb-2">
            Book your simulator session and upgrade to premium clubs at LENGOLF Bangkok.
          </p>
          <a
            href="https://maps.app.goo.gl/pDyzGarizSvYz11G8"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 hover:text-green-600 transition-colors"
          >
            Mercury Ville, Chidlom (Open in Maps)
          </a>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <Link
              href="/bookings"
              className="bg-green-600 hover:bg-green-700 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition-colors text-sm sm:text-base"
            >
              Book with Golf Clubs
            </Link>
            <a
              href="https://lin.ee/uxQpIXn"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-600 hover:bg-gray-700 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition-colors text-sm sm:text-base"
            >
              Questions? Contact Us
            </a>
          </div>
        </div>
      </div>
    </Layout>
  );
}
