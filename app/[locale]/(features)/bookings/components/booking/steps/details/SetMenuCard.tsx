'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ClockIcon, PhotoIcon } from '@heroicons/react/24/outline';
import type { PlayFoodPackage } from '@/types/play-food-packages';
import { setValueFigures } from '@/lib/play-food-value';

export interface SetMenuCardProps {
  pkg: PlayFoodPackage;
  isSelected: boolean;
  /** False when the set is longer than the slot's headroom. */
  isAvailable: boolean;
  onSelect: () => void;
  /** The party size selected in this booking — drives the lead per-person price. */
  numberOfPeople: number;
  /** yyyy-MM-dd, for the weekday/weekend side of the bay-only anchor. */
  date: string;
  /** HH:mm, for the rate slot the anchor is prorated over. */
  startTime: string;
  /**
   * Reserved image slot. There is no per-set photography yet, so every caller
   * leaves this undefined and the card renders a placeholder at the same
   * dimensions. When a shoot lands, pass the path here (or add it to the
   * package data and forward it): the slot and the layout around it do not
   * move, so it stays a content change rather than a redesign.
   */
  imageSrc?: string;
}

/**
 * One Play & Food set, presented at the moment of decision with the same
 * information `/play-and-food` gives: name, tier, itemised food and drinks,
 * the "Most Popular" ribbon — plus two things only the booking flow can know.
 *
 * The **duration** is shown prominently because selecting a set rewrites the
 * booking length (`setDuration(pkg.duration)`). Before this card existed, a
 * customer who had chosen 1.5 h and tapped SET C was silently booked for 3 h.
 *
 * The **bay-only anchor** is computed from the real date and start time, so the
 * claim is true for this slot rather than for the evening rate only.
 */
export function SetMenuCard({
  pkg,
  isSelected,
  isAvailable,
  onSelect,
  numberOfPeople,
  date,
  startTime,
  imageSrc,
}: SetMenuCardProps) {
  const t = useTranslations('bookings.detailsStep');
  // The itemisation, the ribbon and the NET marker are the keys `/play-and-food`
  // already uses in all five locales — reused verbatim so the two surfaces can
  // never describe the same set differently.
  const tPkg = useTranslations('playAndFood.packages');

  const value = setValueFigures({
    price: pkg.price,
    duration: pkg.duration,
    maxPeople: pkg.maxPeople,
    numberOfPeople,
    date,
    startTime,
  });

  return (
    <button
      type="button"
      disabled={!isAvailable}
      onClick={onSelect}
      aria-pressed={isSelected}
      /* The whole card is the control, so nothing inside it is interactive —
         that keeps the tap target the full card without nesting buttons. */
      className={`w-full text-left rounded-xl border-2 overflow-hidden transition-colors ${
        isSelected
          ? 'border-green-600 bg-green-50/60'
          : !isAvailable
          ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
          : 'border-gray-200 bg-white hover:border-green-500'
      }`}
    >
      {/* Reserved image slot — see `imageSrc` above. */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-green-50 via-emerald-50 to-amber-50">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={pkg.name}
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 640px, 100vw"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-green-700/40">
            <PhotoIcon className="h-7 w-7" />
            <span className="text-[10px] font-medium uppercase tracking-wider">
              {t('setPhotoComingSoon')}
            </span>
          </div>
        )}

        {pkg.isPopular && (
          <span className="absolute left-3 top-3 rounded-full bg-green-600 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
            {tPkg('mostPopular')}
          </span>
        )}

        {/* Duration sits on the image, top-right: load-bearing, because picking
            this set overwrites whatever length the customer had chosen. */}
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-0.5 text-[11px] font-semibold text-gray-900 shadow-sm tabular-nums">
          <ClockIcon className="h-3.5 w-3.5 text-green-600" />
          {tPkg('durationValue', { hours: pkg.duration })}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Name + tier. Both are brand/menu strings and stay untranslated,
            matching how `/play-and-food` renders them. */}
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-base font-bold text-green-800">
            {pkg.name}
            <span className="ml-1.5 text-sm font-normal text-gray-600">{pkg.displayName}</span>
          </h4>
          {!isAvailable && (
            <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap">
              {t('packageNotAvailable')}
            </span>
          )}
        </div>

        {/* Per person leads; the total is secondary. */}
        <div>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-2xl font-bold text-green-700 tabular-nums">
              ฿{value.perPerson.toLocaleString()}
            </span>
            <span className="text-xs text-gray-600">
              {t('setPerPersonEach', { count: numberOfPeople })}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-gray-500 tabular-nums">
            {t('setTotalLabel')} ฿{pkg.price.toLocaleString()} {tPkg('priceNet')}
          </div>
          {/* The value curve: honest disclosure that doubles as the upsell,
              since a set is designed for a bigger party. */}
          {value.showValueCurve && (
            <div className="mt-0.5 text-xs font-medium text-green-700 tabular-nums">
              {t('setValueCurve', { price: value.perPersonAtCapacity, count: value.maxPeople })}
            </div>
          )}
        </div>

        {/* Itemised food and drinks, unlimited vs per-person preserved. */}
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-700 mb-1.5">{tPkg('includesLabel')}</p>
          <ul className="space-y-1 text-xs text-gray-600">
            <li>• {tPkg('simulatorUsage', { hours: pkg.duration })}</li>
            {pkg.foodItems.map((food) => (
              <li key={food.name}>
                • {tPkg('foodItem', { quantity: food.quantity, name: food.name })}
              </li>
            ))}
            {pkg.drinks.map((drink) => (
              <li key={drink.name}>
                •{' '}
                {drink.type === 'unlimited'
                  ? tPkg('drinkUnlimited', { name: drink.name })
                  : drink.type === 'per_person'
                  ? tPkg('drinkPerPerson', { quantity: drink.quantity, name: drink.name })
                  : tPkg('drinkGeneric', { quantity: drink.quantity, name: drink.name })}
              </li>
            ))}
          </ul>
        </div>

        {/* Bay-only anchor. Omitted entirely when the food premium is zero or
            negative for this slot rather than printing something odd. */}
        {value.bayOnlyCost !== null && value.foodPremium !== null && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t('setBayAnchor', {
              hours: pkg.duration,
              bayPrice: value.bayOnlyCost,
              premium: value.foodPremium,
            })}
          </p>
        )}

        <div
          className={`rounded-lg py-2 text-center text-sm font-semibold ${
            isSelected ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'
          }`}
        >
          {isSelected ? t('setSelectedBadge') : t('packageSelectCta', { name: pkg.name })}
        </div>
      </div>
    </button>
  );
}
