'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { CheckIcon } from '@heroicons/react/24/outline';
import { getSetThumbnailUrl } from '@/types/golf-club-rental';
import type { GolfClubPricing } from '@/types/golf-club-rental';

interface ClubRentalDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  premiumPricing: GolfClubPricing[];
  premiumPlusPricing: GolfClubPricing[];
}

export function ClubRentalDetailsModal({
  isOpen,
  onClose,
  premiumPricing,
  premiumPlusPricing,
}: ClubRentalDetailsModalProps) {
  const t = useTranslations('bookings.detailsStep');
  const tCommon = useTranslations('common');
  const [paradymCarouselIndex, setParadymCarouselIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={() => onClose()} />
      <div className="fixed inset-0 flex items-end sm:items-center justify-center z-50 sm:p-4">
        <div className="bg-white rounded-t-xl sm:rounded-xl w-full sm:max-w-4xl max-h-[85vh] sm:max-h-[90vh] overflow-hidden relative flex flex-col">
          {/* Close button */}
          <button
            onClick={() => onClose()}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-500 hover:text-gray-700 z-10 bg-white rounded-full p-1 shadow-sm"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="p-4 sm:p-6 lg:p-8 overflow-y-auto flex-1">
            {/* Header */}
            <div className="text-center mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold">
                <span className="text-green-700">{t('clubRentalModalTitleHighlight')}</span>
                <span className="text-gray-900">{t('clubRentalModalTitleSuffix')}</span>
              </h2>
              <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2">
                {t('clubRentalModalSubtitle')}
              </p>
            </div>

            {/* Pricing Comparison Table */}
            <div className="mb-6">
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="py-2.5 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700 bg-gray-50">{t('clubRentalTableDuration')}</th>
                      <th className="py-2.5 px-3 text-center text-xs sm:text-sm font-semibold text-green-700 bg-gray-50">{t('clubRentalTablePremium')}</th>
                      <th className="py-2.5 px-3 text-center text-xs sm:text-sm font-semibold text-white" style={{ backgroundColor: '#003d1f' }}>{t('clubRentalTablePremiumPlus')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {premiumPricing.map((premium, i) => {
                      const premiumPlus = premiumPlusPricing[i];
                      return (
                        <tr key={premium.duration}>
                          <td className="py-2.5 px-3 text-xs sm:text-sm font-medium text-gray-900">{premium.displayText}</td>
                          <td className="py-2.5 px-3 text-center text-sm sm:text-lg font-bold text-green-600">฿{premium.price.toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-center text-sm sm:text-lg font-bold" style={{ color: '#003d1f', backgroundColor: 'rgba(0,61,31,0.05)' }}>฿{premiumPlus.price.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-center text-xs text-gray-500 mt-2">{t('clubRentalStandardFreeNote')}</p>
              <p className="text-center text-xs text-gray-500 mt-1 italic">{t('clubRentalHandednessNote')}</p>
            </div>

            {/* Club Options - flex col on mobile, 3-col on desktop, all cards stretch to equal height */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
              {/* Standard Clubs */}
              <div className="bg-gray-50 rounded-lg border p-4 sm:p-5 opacity-90 flex flex-col">
                <h3 className="text-base sm:text-lg font-bold text-gray-700 mb-1">{t('clubRentalStandardCardTitle')}</h3>
                <p className="text-xs italic text-gray-500 mb-2">{t('clubRentalStandardCardSubtitle')}</p>
                <p className="text-xs sm:text-sm text-gray-500 mb-3">{t('clubRentalStandardCardSubtitle2')}</p>

                <div className="mb-4 flex-1">
                  <ul className="space-y-1 text-xs sm:text-sm text-gray-600">
                    <li className="flex items-start">
                      <CheckIcon className="h-3.5 w-3.5 text-gray-500 mr-1.5 mt-0.5 flex-shrink-0" />
                      <span>{t('clubRentalStandardItem1')}</span>
                    </li>
                    <li className="flex items-start">
                      <CheckIcon className="h-3.5 w-3.5 text-gray-500 mr-1.5 mt-0.5 flex-shrink-0" />
                      <span>{t('clubRentalStandardItem2')}</span>
                    </li>
                  </ul>
                </div>

                <div className="text-center py-2 px-3 rounded bg-gray-200 text-gray-700 font-semibold text-sm mt-auto">
                  {t('clubRentalStandardFreeWithBooking')}
                </div>
              </div>

              {/* Premium Clubs */}
              <div className="bg-white rounded-lg border-2 border-green-500 p-4 sm:p-5 relative flex flex-col">
                <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-3 py-0.5 rounded-full text-xs font-semibold">
                  {t('clubRentalPremiumBadge')}
                </div>

                {/* Warbird + Majesty photo pair */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="relative h-28 bg-white rounded-md overflow-hidden border border-gray-100">
                    <Image
                      src={getSetThumbnailUrl({ tier: 'premium', gender: 'mens' })}
                      alt={t('clubRentalPremiumImageMensAlt')}
                      fill
                      className="object-contain p-1"
                      sizes="(max-width: 768px) 50vw, 200px"
                      loading="lazy"
                    />
                  </div>
                  <div className="relative h-28 bg-white rounded-md overflow-hidden border border-gray-100">
                    <Image
                      src={getSetThumbnailUrl({ tier: 'premium', gender: 'womens' })}
                      alt={t('clubRentalPremiumImageWomensAlt')}
                      fill
                      className="object-contain p-1"
                      sizes="(max-width: 768px) 50vw, 200px"
                      loading="lazy"
                    />
                  </div>
                </div>

                <h3 className="text-base sm:text-lg font-bold text-green-800 mb-1">{t('clubRentalPremiumCardTitle')}</h3>
                <p className="text-xs italic text-gray-600 mb-2">{t('clubRentalPremiumCardSubtitle')}</p>

                <div className="space-y-2 mb-4 flex-1">
                  <div className="border-l-3 border-green-500 pl-2.5">
                    <h4 className="font-semibold text-gray-800 text-xs sm:text-sm">{t('clubRentalPremiumMensTitle')}</h4>
                    <p className="text-[11px] sm:text-xs text-gray-600">{t('clubRentalPremiumMensSpecs')}</p>
                  </div>
                  <div className="border-l-3 border-green-500 pl-2.5">
                    <h4 className="font-semibold text-gray-800 text-xs sm:text-sm">{t('clubRentalPremiumWomensTitle')}</h4>
                    <p className="text-[11px] sm:text-xs text-gray-600">{t('clubRentalPremiumWomensSpecs')}</p>
                  </div>
                </div>

                <div className="text-center py-2 px-3 rounded bg-green-600 text-white font-semibold text-sm mt-auto">
                  {t('clubRentalStartingFromPremium')}
                </div>
              </div>

              {/* Premium+ Clubs - Standout dark green + white */}
              <div className="rounded-lg border-2 border-green-900 p-4 sm:p-5 relative flex flex-col" style={{ backgroundColor: '#003d1f' }}>
                <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-white px-3 py-0.5 rounded-full text-xs font-semibold" style={{ color: '#003d1f' }}>
                  {t('clubRentalPremiumPlusBadge')}
                </div>

                {/* Paradym hero photo */}
                <div className="relative h-28 bg-white rounded-md overflow-hidden mb-3">
                  <Image
                    src={getSetThumbnailUrl({ tier: 'premium-plus', gender: 'mens' })}
                    alt={t('clubRentalPremiumPlusImageAlt')}
                    fill
                    className="object-contain p-1"
                    sizes="(max-width: 768px) 100vw, 33vw"
                    loading="lazy"
                  />
                </div>

                <h3 className="text-base sm:text-lg font-bold text-white mb-1">{t('clubRentalPremiumPlusCardTitle')}</h3>
                <p className="text-xs italic text-white/70 mb-2">{t('clubRentalPremiumPlusCardSubtitle')}</p>
                <p className="text-xs sm:text-sm text-white/80 mb-3">{t('clubRentalPremiumPlusCardSubtitle2')}</p>

                <div className="space-y-1 mb-2 flex-1">
                  <ul className="space-y-0.5 text-xs sm:text-sm text-white/90">
                    <li className="flex items-start">
                      <CheckIcon className="h-3.5 w-3.5 text-white mr-1.5 mt-0.5 flex-shrink-0" />
                      <span>{t('clubRentalPremiumPlusItem1')}</span>
                    </li>
                    <li className="flex items-start">
                      <CheckIcon className="h-3.5 w-3.5 text-white mr-1.5 mt-0.5 flex-shrink-0" />
                      <span>{t('clubRentalPremiumPlusItem2')}</span>
                    </li>
                    <li className="flex items-start">
                      <CheckIcon className="h-3.5 w-3.5 text-white mr-1.5 mt-0.5 flex-shrink-0" />
                      <span>{t('clubRentalPremiumPlusItem3')}</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => setParadymCarouselIndex(0)}
                  className="text-[11px] sm:text-xs text-white/70 hover:text-white underline mb-3 text-left"
                >
                  {t('clubRentalPremiumPlusViewPhotos')}
                </button>

                <div className="text-center py-2 px-3 rounded font-semibold text-sm bg-white mt-auto" style={{ color: '#003d1f' }}>
                  {t('clubRentalStartingFromPremiumPlus')}
                </div>
              </div>
            </div>

            {/* On-Course Rental Link */}
            <div className="mt-4 text-center text-xs sm:text-sm text-gray-500">
              {t('clubRentalCourseLink')}{' '}
              <a
                href="https://len.golf/golf-course-club-rental/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-600 hover:text-green-700 underline font-medium"
              >
                {t('clubRentalCourseLinkCta')}
              </a>
            </div>

            {/* Close Button */}
            <div className="mt-6 text-center">
              <button
                onClick={() => onClose()}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg font-medium transition-colors text-sm"
              >
                {tCommon('close')}
              </button>
            </div>

            {/* Paradym Full-Screen Image Carousel */}
            {paradymCarouselIndex !== null && (() => {
              const baseUrl = 'https://bisimqmtxjsptehhqpeg.supabase.co/storage/v1/object/public/website-assets/clubs/premium-plus';
              const images = Array.from({ length: 18 }, (_, i) => ({
                src: `${baseUrl}/${i + 1}.png`,
                alt: t('carouselPhotoAlt', { index: i + 1 }),
              }));
              const current = images[paradymCarouselIndex];
              return (
                <div className="fixed inset-0 bg-black/90 z-[60] flex flex-col items-center justify-center" onClick={() => setParadymCarouselIndex(null)}>
                  {/* Close */}
                  <button
                    onClick={() => setParadymCarouselIndex(null)}
                    className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 z-10"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                  {/* Counter */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-xs sm:text-sm font-medium">
                    {paradymCarouselIndex + 1} / {images.length}
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
                    onClick={(e) => { e.stopPropagation(); setParadymCarouselIndex((paradymCarouselIndex - 1 + images.length) % images.length); }}
                    className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 sm:p-3"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setParadymCarouselIndex((paradymCarouselIndex + 1) % images.length); }}
                    className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 sm:p-3"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {/* Thumbnail strip */}
                  <div className="flex gap-2 pb-4 pt-2 overflow-x-auto max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
                    {images.map((img, i) => (
                      <button
                        key={img.alt}
                        type="button"
                        onClick={() => setParadymCarouselIndex(i)}
                        className={`w-10 h-10 sm:w-12 sm:h-12 rounded overflow-hidden border-2 transition-colors ${
                          i === paradymCarouselIndex ? 'border-white' : 'border-transparent opacity-50 hover:opacity-80'
                        }`}
                      >
                        <Image src={img.src} alt={img.alt} width={48} height={48} className="w-full h-full object-contain bg-white/10 p-0.5" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </>
  );
}
