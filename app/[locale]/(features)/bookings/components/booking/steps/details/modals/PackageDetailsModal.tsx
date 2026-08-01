'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { PlayFoodPackage } from '@/types/play-food-packages';

interface PackageDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  packages: PlayFoodPackage[];
  maxDuration: number;
  onSelectPackage: (pkg: PlayFoodPackage) => void;
  onContinueWithoutPackage: () => void;
}

export function PackageDetailsModal({
  isOpen,
  onClose,
  packages,
  maxDuration,
  onSelectPackage,
  onContinueWithoutPackage,
}: PackageDetailsModalProps) {
  const t = useTranslations('bookings.detailsStep');

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
                <span className="text-green-700">{t('packageModalTitleHighlight')}</span>
                <span className="text-gray-900">{t('packageModalTitleSuffix')}</span>
              </h2>
              <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2">
                {t('packageModalSubtitle')}
              </p>
            </div>

            {/* Package Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {packages.map((pkg) => {
                const isAvailable = pkg.duration <= maxDuration;
                return (
                  <div
                    key={pkg.id}
                    className={`bg-white rounded-lg border-2 p-3 sm:p-4 ${
                      pkg.isPopular ? 'border-green-500 relative' : 'border-gray-200'
                    } ${!isAvailable ? 'opacity-60' : ''}`}
                  >
                    {pkg.isPopular && (
                      <div className="absolute -top-2 sm:-top-3 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-2 sm:px-3 py-0.5 rounded-full text-xs font-semibold">
                        {t('packageMostPopular')}
                      </div>
                    )}

                    <div className="text-center mb-2 sm:mb-3">
                      <h3 className="text-base sm:text-lg font-bold text-green-800">{pkg.name}</h3>
                      <p className="text-xs sm:text-sm text-gray-600">{pkg.displayName}</p>
                    </div>

                    <div className="text-center mb-2 sm:mb-3">
                      <div className="text-lg sm:text-xl font-bold text-green-700">
                        ฿{pkg.price.toLocaleString()} <span className="text-xs font-normal text-gray-600">NET</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {t('packagePricePerPerson', { price: pkg.pricePerPerson })}
                      </div>
                    </div>

                    <div className="text-xs text-gray-600 space-y-0.5 sm:space-y-1 mb-2 sm:mb-3">
                      <div className="font-semibold">{t('packageDurationLabel', { duration: pkg.duration })}</div>
                      <div className="font-semibold mt-1 sm:mt-2">{t('packageIncludes')}</div>
                      <div className="text-[11px] sm:text-xs space-y-0.5">
                        <div>• {t('packageGolfSimulator', { duration: pkg.duration })}</div>
                        {pkg.foodItems.slice(0, 2).map((food, idx) => (
                          <div key={idx}>• {food.name}</div>
                        ))}
                        {pkg.foodItems.length > 2 && (
                          <div>• {t('packageMoreItems', { count: pkg.foodItems.length - 2 })}</div>
                        )}
                        <div>• {pkg.drinks[0].type === 'unlimited' ? t('packageDrinksUnlimited') : t('packageDrinksIncluded')}</div>
                      </div>
                    </div>

                    <button
                      disabled={!isAvailable}
                      onClick={() => {
                        if (isAvailable) {
                          onSelectPackage(pkg);
                        }
                      }}
                      className={`w-full py-1.5 sm:py-2 px-2 sm:px-3 rounded text-xs sm:text-sm font-semibold transition-colors ${
                        !isAvailable
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : pkg.isPopular
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-green-500 hover:bg-green-600 text-white'
                      }`}
                    >
                      {!isAvailable ? t('packageNotAvailable') : t('packageSelectCta', { name: pkg.name })}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Bay Only Option */}
            <div className="mt-4 border-t pt-4">
              <button
                onClick={() => onContinueWithoutPackage()}
                className="w-full py-2 px-3 rounded border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t('packageContinueWithoutPackage')}
              </button>
            </div>

            {/* Additional Info */}
            <div className="mt-4 sm:mt-6 bg-gray-50 rounded-lg p-3 sm:p-4 text-center">
              <p className="text-xs sm:text-sm text-gray-600">
                {t('packageGroupNote')}
              </p>
              <Link
                href="/play-and-food"
                className="inline-block mt-2 sm:mt-3 text-xs sm:text-sm text-green-600 hover:text-green-700 underline"
              >
                {t('packageViewFullDetails')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
