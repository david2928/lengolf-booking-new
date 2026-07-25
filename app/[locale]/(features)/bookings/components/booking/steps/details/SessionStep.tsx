'use client';

import { useTranslations } from 'next-intl';
import {
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  ComputerDesktopIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import type { PlayFoodPackage } from '@/types/play-food-packages';
import type { BayType } from '@/lib/bayConfig';
import type { TimeSlot, DurationBayAvailability } from '../../../../hooks/useAvailability';

export interface SessionStepProps {
  maxDuration: number;
  slotData?: TimeSlot | null;
  duration: number;
  setDuration: (value: number) => void;
  numberOfPeople: number;
  setNumberOfPeople: (value: number) => void;
  localSelectedPackage: PlayFoodPackage | null;
  setLocalSelectedPackage: (value: PlayFoodPackage | null) => void;
  PLAY_FOOD_PACKAGES: PlayFoodPackage[];
  setShowPackageModal: (value: boolean) => void;
  /** Passed in rather than re-derived via `useRouter()` so this stage does not
      touch the locale-unaware routing that is being fixed separately. */
  router: { replace: (href: string, options?: { scroll?: boolean }) => void };
  /** `errors.duration` from the form hook. Rendered but never set today. */
  durationError: string;
  currentAvailability: DurationBayAvailability;
  // --- Selected Info Cards + AI Lab warning (moved in from BookingDetails) ---
  selectedDate: Date;
  selectedTime: string;
  /** Bay type carried over from the time step. `null` means "All Bays", which
      is when the in-card Social / AI Lab toggle is offered. */
  selectedBayType?: BayType | null;
  selectedBay: BayType | null;
  setSelectedBay: (value: BayType | null) => void;
  setShowBayInfoModal: (value: boolean) => void;
  formatDate: (date: Date) => string;
  /** Leaves step 3 entirely (the AI Lab warning's "go back to Social Bay"). */
  onBack: () => void;
}

/**
 * Session section of booking step 3: the Selected Info Cards (date, start time,
 * bay type), the AI Lab group-size warning, the Play & Food package fork,
 * duration and number of people. Renders as a fragment so the parent `<form>`'s
 * `space-y-4 sm:space-y-6` keeps applying to these blocks as direct children.
 *
 * `id="bd-bay"` on the bay-type card is load-bearing: `firstInvalidField` in
 * `useBookingDetailsForm` locates it with `document.getElementById`, which is a
 * runtime lookup with no type safety.
 */
export function SessionStep({
  maxDuration,
  slotData,
  duration,
  setDuration,
  numberOfPeople,
  setNumberOfPeople,
  localSelectedPackage,
  setLocalSelectedPackage,
  PLAY_FOOD_PACKAGES,
  setShowPackageModal,
  router,
  durationError,
  currentAvailability,
  selectedDate,
  selectedTime,
  selectedBayType,
  selectedBay,
  setSelectedBay,
  setShowBayInfoModal,
  formatDate,
  onBack,
}: SessionStepProps) {
  const t = useTranslations('bookings.detailsStep');

  return (
    <>
      {/* Selected Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6 border border-green-100">
          <div className="flex items-center gap-3">
            <div className="bg-green-50 p-2 sm:p-3 rounded-full">
              <CalendarIcon className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">{t('selectedDate')}</h3>
              <p className="text-lg sm:text-xl font-bold text-green-700">
                {formatDate(selectedDate)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6 border border-green-100">
          <div className="flex items-center gap-3">
            <div className="bg-green-50 p-2 sm:p-3 rounded-full">
              <ClockIcon className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">{t('startTime')}</h3>
              <p className="text-lg sm:text-xl font-bold text-green-700">
                {selectedTime}
              </p>
            </div>
          </div>
        </div>

        <div id="bd-bay" className="bg-white rounded-xl shadow-sm p-3 sm:p-6 border border-green-100 scroll-mt-24">
          <div className="flex items-center gap-3">
            <div className={`p-2 sm:p-3 rounded-full ${
              (selectedBayType === 'ai_lab' || selectedBay === 'ai_lab')
                ? 'bg-purple-50'
                : 'bg-green-50'
            }`}>
              {(selectedBayType === 'ai_lab' || selectedBay === 'ai_lab') ? (
                <ComputerDesktopIcon className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600" />
              ) : (
                <UsersIcon className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">
                {t('bayType')} <span className="text-red-500">*</span>
              </h3>
              {!selectedBayType ? (
                <div className="space-y-2 mt-1">
                  <div className="flex bg-gray-100 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setSelectedBay('social')}
                      disabled={currentAvailability.social === 0}
                      className={`flex-1 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        selectedBay === 'social'
                          ? 'bg-green-600 text-white shadow-sm'
                          : currentAvailability.social === 0
                          ? 'text-gray-400 cursor-not-allowed'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      {t('social')} {currentAvailability.social === 0 && t('naSuffix')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedBay('ai_lab')}
                      disabled={currentAvailability.ai === 0}
                      className={`flex-1 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        selectedBay === 'ai_lab'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : currentAvailability.ai === 0
                          ? 'text-gray-400 cursor-not-allowed'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      {t('aiLab')} {currentAvailability.ai === 0 && t('naSuffix')}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBayInfoModal(true)}
                    className="text-xs text-gray-500 hover:text-gray-700 underline transition-colors"
                  >
                    {t('whatsTheDifference')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className={`text-lg sm:text-xl font-bold ${
                    selectedBayType === 'ai_lab' ? 'text-purple-700' : 'text-green-700'
                  }`}>
                    {selectedBayType === 'ai_lab' ? t('aiLab') : t('socialBay')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowBayInfoModal(true)}
                    className="text-xs text-gray-500 hover:text-gray-700 underline transition-colors"
                  >
                    {t('info')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Lab Group Size Warning */}
      {(selectedBayType === 'ai_lab' || selectedBay === 'ai_lab') && numberOfPeople >= 3 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
          <div className="flex items-start">
            <InformationCircleIcon className="h-5 w-5 text-yellow-400 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-yellow-800 mb-1">
                {t('aiLabRecommendationTitle')}
              </h4>
              <p className="text-sm text-yellow-700">
                {t('aiLabRecommendationBody')}
              </p>
              <button
                type="button"
                onClick={onBack}
                className="mt-2 text-sm text-yellow-600 hover:text-yellow-500 underline"
              >
                {t('aiLabBackToSocial')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Play & Food Package Selection */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-gray-700">
            {t('playFoodPackageLabel')}
          </label>
          <button
            type="button"
            onClick={() => setShowPackageModal(true)}
            className="text-xs text-green-600 hover:text-green-700 underline"
          >
            {t('viewDetails')}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => {
              setLocalSelectedPackage(null);
              setDuration(1);
              setNumberOfPeople(1);
              router.replace('/bookings', { scroll: false });
            }}
            className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs relative ${
              !localSelectedPackage
                ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                : 'border-gray-300 text-gray-700 hover:border-green-600'
            }`}
          >
            <span className="font-semibold text-[11px] sm:text-xs">{t('bayOnly')}</span>
            <span className="text-[9px] sm:text-[10px] mt-0.5 opacity-75">{t('bayOnlyDescription')}</span>
          </button>

          {PLAY_FOOD_PACKAGES.map((pkg) => {
            const isAvailable = pkg.duration <= maxDuration;
            return (
              <button
                key={pkg.id}
                type="button"
                disabled={!isAvailable}
                onClick={() => {
                  if (isAvailable) {
                    setLocalSelectedPackage(pkg);
                    setDuration(pkg.duration);
                    const newUrl = `/bookings?package=${pkg.id}`;
                    router.replace(newUrl, { scroll: false });
                  }
                }}
                className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
                  localSelectedPackage?.id === pkg.id
                    ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                    : !isAvailable
                    ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                    : 'border-gray-300 text-gray-700 hover:border-green-600'
                }`}
              >
                <span className="text-lg font-bold mb-1">{pkg.id.split('_')[1]}</span>
                <span>฿{pkg.price.toLocaleString()}</span>
              </button>
            );
          })}
        </div>

        {localSelectedPackage ? (
          <div className="mt-4 p-3 bg-green-50 rounded-lg">
            <div className="text-sm font-medium text-green-800 mb-2">
              {t('selectedPackageInline', {
                name: localSelectedPackage.name,
                duration: localSelectedPackage.duration,
                price: localSelectedPackage.price.toLocaleString(),
              })}
            </div>
            <div className="text-xs text-gray-600">
              <span className="font-medium">{t('packageIncludes')}</span> Golf simulator, {localSelectedPackage.foodItems.map(f => f.name).join(', ')}, {localSelectedPackage.drinks.map(d => d.type === 'unlimited' ? `Unlimited ${d.name}` : d.type === 'per_person' ? `${d.quantity}x ${d.name} per person` : `${d.quantity}x ${d.name}`).join(', ')}
            </div>
          </div>
        ) : (
          <div className="mt-3 text-xs text-gray-500 text-center">
            {t('bayOnlyHelper')}
          </div>
        )}
      </div>


      {/* Duration Selection - Only for regular bookings */}
      {!localSelectedPackage && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('durationLabel')}
          </label>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: maxDuration }, (_, i) => i + 1).map((hours) => (
              <button
                key={hours}
                type="button"
                onClick={() => setDuration(hours)}
                className={`flex h-12 items-center justify-center rounded-lg border relative ${
                  duration === hours
                    ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                    : 'border-gray-300 text-gray-700 hover:border-green-600'
                }`}
              >
                {hours}
              </button>
            ))}
          </div>
          {durationError && (
            <p className="mt-1 text-sm text-red-600">{durationError}</p>
          )}

          {/* Bay availability indicator for current duration */}
          {slotData?.bayAvailabilityByDuration && currentAvailability.total > 0 && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <InformationCircleIcon className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <span className="font-medium text-blue-900">{t('availableForDuration', { duration })}</span>
                  {currentAvailability.social > 0 && currentAvailability.ai > 0 && (
                    <span className="text-blue-700">
                      {t('availableSocialOrAi', { social: currentAvailability.social, ai: currentAvailability.ai })}
                    </span>
                  )}
                  {currentAvailability.social > 0 && currentAvailability.ai === 0 && (
                    <span className="text-blue-700">
                      {t('availableSocialOnly', { social: currentAvailability.social })}
                    </span>
                  )}
                  {currentAvailability.social === 0 && currentAvailability.ai > 0 && (
                    <span className="text-blue-700">
                      {t('availableAiOnly')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Number of People */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('numberOfPeople')}
        </label>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => setNumberOfPeople(num)}
              className={`flex h-12 items-center justify-center rounded-lg border ${
                numberOfPeople === num
                  ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                  : 'border-gray-300 text-gray-700 hover:border-green-600'
              }`}
            >
              {num}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
