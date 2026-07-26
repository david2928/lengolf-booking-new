'use client';

import Image from 'next/image';
import { useTranslations, type useFormatter } from 'next-intl';
import { CheckIcon } from '@heroicons/react/24/outline';
import { getIndoorPrice, getSetThumbnailUrl, getGearUpItems } from '@/types/golf-club-rental';
import type { RentalClubSetWithAvailability } from '@/types/golf-club-rental';

export interface ExtrasStepProps {
  selectedClubRental: string;
  onClubRentalChange?: (clubId: string) => void;
  selectedClubSetId?: string | null;
  onClubSetIdChange?: (id: string | null) => void;
  setShowClubRentalModal: (value: boolean) => void;
  clubSetsLoading: boolean;
  availableClubSets: RentalClubSetWithAvailability[];
  duration: number;
  selectedAddOns: Record<string, boolean>;
  onAddOnsChange?: (addOns: Record<string, boolean>) => void;
  formatter: ReturnType<typeof useFormatter>;
}

/**
 * Extras section of booking step 3: golf club rental selection (No Rental /
 * Standard, the DB-driven premium sets, and the static fallback) and the
 * Gear Up add-ons. Renders as a fragment so the parent `<form>`'s
 * `space-y-4 sm:space-y-6` keeps applying to these blocks as direct children.
 */
export function ExtrasStep({
  selectedClubRental,
  onClubRentalChange,
  selectedClubSetId,
  onClubSetIdChange,
  setShowClubRentalModal,
  clubSetsLoading,
  availableClubSets,
  duration,
  selectedAddOns,
  onAddOnsChange,
  formatter,
}: ExtrasStepProps) {
  const t = useTranslations('bookings.detailsStep');

  return (
    <>
      {/* Golf Club Rental Selection */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-gray-700">
            {t('clubRentalLabel')}
          </label>
          <button
            type="button"
            onClick={() => setShowClubRentalModal(true)}
            className="text-xs text-green-600 hover:text-green-700 underline"
          >
            {t('viewDetails')}
          </button>
        </div>

        {/* No Rental / Standard row */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            type="button"
            onClick={() => { onClubRentalChange?.('none'); onClubSetIdChange?.(null); }}
            className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
              selectedClubRental === 'none'
                ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                : 'border-gray-300 text-gray-700 hover:border-green-600'
            }`}
          >
            <span className="font-semibold text-[11px] sm:text-xs">{t('noRental')}</span>
            <span className="text-[9px] sm:text-[10px] mt-0.5 opacity-75">{t('noRentalDescription')}</span>
          </button>

          <button
            type="button"
            onClick={() => { onClubRentalChange?.('standard'); onClubSetIdChange?.(null); }}
            className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
              selectedClubRental === 'standard'
                ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                : 'border-gray-300 text-gray-700 hover:border-green-600'
            }`}
          >
            <span className="font-semibold text-[11px] sm:text-xs">{t('standardSet')}</span>
            <span className="text-[9px] sm:text-[10px] mt-0.5 opacity-75 text-gray-500">{t('standardSetFree')}</span>
          </button>
        </div>

        {/* Premium club sets from DB with real availability */}
        {clubSetsLoading ? (
          <div className="text-xs text-gray-400 text-center py-3">{t('checkingClubAvailability')}</div>
        ) : availableClubSets.length > 0 ? (
          <div className="space-y-2">
            {availableClubSets.map((clubSet) => {
              const isSelected = selectedClubSetId === clubSet.id;
              const isAvailable = clubSet.available_count > 0;
              const price = getIndoorPrice(clubSet, duration);
              const isPremiumPlus = clubSet.tier === 'premium-plus';
              const thumbUrl = getSetThumbnailUrl(clubSet);

              return (
                <button
                  key={clubSet.id}
                  type="button"
                  disabled={!isAvailable}
                  onClick={() => {
                    if (!isAvailable) return;
                    onClubRentalChange?.(clubSet.tier);
                    onClubSetIdChange?.(clubSet.id);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    !isAvailable
                      ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                      : isSelected && isPremiumPlus
                        ? 'border-[#c8a96e] text-white'
                        : isSelected
                          ? 'border-green-600 bg-green-50'
                          : 'border-gray-300 hover:border-green-600'
                  }`}
                  style={isSelected && isPremiumPlus ? { backgroundColor: '#003d1f' } : undefined}
                >
                  {thumbUrl && (
                    <div className={`relative w-14 h-14 rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center border ${
                      isSelected && isPremiumPlus ? 'bg-white border-white/30' : 'bg-white border-gray-200'
                    }`}>
                      <Image
                        src={thumbUrl}
                        alt={`${clubSet.brand ?? ''} ${clubSet.model ?? ''}`.trim() || 'Club set'}
                        fill
                        className="object-contain p-0.5"
                        sizes="56px"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-semibold text-xs ${
                        isSelected && isPremiumPlus ? 'text-white' :
                        isSelected ? 'text-green-700' :
                        isPremiumPlus ? 'text-[#003d1f]' : 'text-gray-900'
                      }`}>
                        {isPremiumPlus ? t('premiumPlusLabel') : t('premiumLabel')} {clubSet.gender === 'mens' ? t('clubSetMens') : t('clubSetWomens')}
                      </span>
                      {!isAvailable && (
                        <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">{t('clubSetUnavailable')}</span>
                      )}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${
                      isSelected && isPremiumPlus ? 'text-white/70' :
                      isSelected ? 'text-green-600/70' : 'text-gray-500'
                    }`}>
                      {clubSet.brand} {clubSet.model}
                    </div>
                  </div>
                  <div className={`text-right flex-shrink-0 ml-auto ${
                    isSelected && isPremiumPlus ? 'text-white' :
                    isSelected ? 'text-green-700' : 'text-gray-900'
                  }`}>
                    <div className="font-bold text-sm">฿{price.toLocaleString()}</div>
                    <div className={`text-[10px] ${
                      isSelected && isPremiumPlus ? 'text-white/60' : 'text-gray-400'
                    }`}>{t('clubSetDurationSuffix', { hours: duration })}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* Fallback to static buttons if DB fetch fails */
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { onClubRentalChange?.('premium'); onClubSetIdChange?.(null); }}
              className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
                selectedClubRental === 'premium'
                  ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                  : 'border-gray-300 text-gray-700 hover:border-green-600'
              }`}
            >
              <span className="font-semibold text-[11px] sm:text-xs text-green-600 font-bold">{t('premiumLabel')}</span>
              <span className="text-[10px] sm:text-xs mt-0.5 opacity-75">{t('premiumStartingFromShort')}</span>
            </button>

            <button
              type="button"
              onClick={() => { onClubRentalChange?.('premium-plus'); onClubSetIdChange?.(null); }}
              className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs transition-colors ${
                selectedClubRental === 'premium-plus'
                  ? 'border-[#c8a96e] text-white font-medium'
                  : 'border-gray-300 text-gray-700 hover:border-[#c8a96e]'
              }`}
              style={selectedClubRental === 'premium-plus' ? { backgroundColor: '#003d1f' } : undefined}
            >
              <span className="font-bold text-[11px] sm:text-xs" style={{ color: selectedClubRental === 'premium-plus' ? '#ffffff' : '#003d1f' }}>
                {t('premiumPlusLabel')}
              </span>
              <span className={`text-[10px] sm:text-xs mt-0.5 ${selectedClubRental === 'premium-plus' ? 'text-white/80' : 'opacity-75'}`}>{t('premiumPlusStartingFromShort')}</span>
            </button>
          </div>
        )}

      </div>

      {/* Gear Up — optional add-on items sold at booking time (e.g. glove). */}
      {(() => {
        const gearUpItems = getGearUpItems().filter((g) => g.id === 'gloves');
        if (gearUpItems.length === 0) return null;
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              {t('gearUpLabel')}
            </label>
            <div className="grid grid-cols-1 gap-2">
              {gearUpItems.map((item) => {
                const isSelected = !!selectedAddOns[item.id];
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onAddOnsChange?.({ ...selectedAddOns, [item.id]: !isSelected })}
                    className={`group flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                      isSelected
                        ? 'border-green-600 bg-green-50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-green-300'
                    }`}
                  >
                    <div className={`relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0 border ${
                      isSelected ? 'bg-white border-green-200' : 'bg-gray-50 border-gray-200'
                    }`}>
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        sizes="64px"
                        className="object-contain p-1"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 leading-tight">{item.name}</p>
                      {item.description && (
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{item.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className="text-sm font-bold text-green-700">฿{formatter.number(item.price)}</p>
                      <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-green-600 border-green-600' : 'border-gray-300 bg-white'
                      }`}>
                        {isSelected && <CheckIcon className="h-4 w-4 text-white stroke-[3]" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}
    </>
  );
}
