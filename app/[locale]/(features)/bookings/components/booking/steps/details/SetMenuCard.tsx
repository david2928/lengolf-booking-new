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
   * Overrides the photo this card would pick for `pkg.id` from `SET_IMAGES`.
   * Callers normally leave it undefined and let the id decide; it exists for a
   * surface that needs to show a set against different photography (a campaign
   * shot, a seasonal variant) without teaching this component about the reason.
   * A set with neither an override nor an entry in the map falls back to the
   * placeholder.
   */
  imageSrc?: string;
}

/**
 * Per-set photography, keyed by package id.
 *
 * Cropped from `public/images/Play and food_2.jpg` to exactly the slot's
 * `aspect-[16/9]` at 1280x720, keeping the brand green background, so the three
 * cards sit as one strip rather than three unrelated crops.
 *
 * `Partial` is deliberate. A fourth set added to `PlayFoodPackage['id']` before
 * its shoot lands must fall through to the placeholder, not fail to compile or
 * render a broken `<img>` — the same reason the placeholder branch below is
 * kept rather than deleted now that all three current sets have a photo.
 */
const SET_IMAGES: Partial<Record<PlayFoodPackage['id'], string>> = {
  SET_A: '/images/play-food/set-a.jpg',
  SET_B: '/images/play-food/set-b.jpg',
  SET_C: '/images/play-food/set-c.jpg',
};

/**
 * One Play & Food set, presented at the moment of decision with the same
 * information `/play-and-food` gives: name, tier, itemised food and drinks,
 * the "Most Popular" ribbon — plus two things only the booking flow can know.
 *
 * The **duration** is shown prominently because selecting a set rewrites the
 * booking length (`setDuration(pkg.duration)`). Before this card existed, a
 * customer who had chosen 1.5 h and tapped SET C was silently booked for 3 h.
 *
 * The **price split** under the total is computed from the real date and start
 * time, so the bay figure is true for this slot rather than for the evening
 * rate only.
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

  const resolvedImageSrc = imageSrc ?? SET_IMAGES[pkg.id];

  const value = setValueFigures({
    price: pkg.price,
    duration: pkg.duration,
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
         that keeps the tap target the full card without nesting buttons.

         Always a photo-over-content column: on a phone the grid in
         `SessionStep` stacks the cards, from `md` up it sets them three
         across, and the card itself does not need to know which. The grid's
         default `items-stretch` is what makes all three cards the height of
         the tallest (`h-full` is only belt-and-braces for a future
         non-stretching parent); `flex-col` and the flex chain (content
         `flex-1`, includes `flex-1` inside it) spend the slack above the pill,
         so the three actions land on one line however long each includes
         list runs. In the stacked case there is no slack and they are
         inert. */
      className={`w-full h-full flex flex-col text-left rounded-xl border-2 overflow-hidden transition-colors ${
        isSelected
          ? 'border-green-600 bg-green-50/60'
          : !isAvailable
          ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
          : 'border-gray-200 bg-white hover:border-green-500'
      }`}
    >
      {/* The image slot. `imageSrc` wins, then the set's own photo, then the
          placeholder — so a set with no photography still renders a card of the
          same height and nothing below it shifts.
          The slot is always the card's full width at 16/9 — the same ratio the
          photography was cropped to. That matters: each set photo is a wide
          spread (burger left, fries centre, drink right, edge to edge), so any
          slot with a different shape puts `object-cover` in charge of deciding
          which items survive. An earlier row-layout draft learned this the
          hard way: its taller-than-wide slab cropped SET A down to the fries
          plate and silently dropped the burger and the drink. */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-green-50 via-emerald-50 to-amber-50">
        {resolvedImageSrc ? (
          <Image
            src={resolvedImageSrc}
            alt={pkg.name}
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 300px, (min-width: 768px) 33vw, 100vw"
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

        {/* Duration sits on the image, bottom-right: load-bearing, because
            picking this set overwrites whatever length the customer had
            chosen. Bottom rather than top so it can never collide with the
            "Most Popular" ribbon: at the grid's narrowest column (~185px at a
            1024px viewport) the two pills side by side outrun the image. */}
        {/* Solid brand green at text-sm, not the 11px white whisper it started
            as — the hours are the one figure on the photo, and the owner asked
            for them to actually read at a glance. */}
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-green-700 px-3 py-1 text-sm font-bold text-white shadow-md tabular-nums">
          <ClockIcon className="h-4 w-4" />
          {tPkg('durationValue', { hours: pkg.duration })}
        </span>
      </div>

      {/* The flex chain described on the button: this column takes the height
          the grid row leaves after the photo, and the includes list (`flex-1`
          below) absorbs it, pinning the select pill to the card's bottom edge
          in every column — three cards whose actions do not line up read as
          three unrelated boxes. */}
      <div className="p-4 space-y-3 flex flex-1 flex-col">
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

        {/* TWO money lines, and never the same number twice.
            This block used to carry four statements for one price. At a party
            of one they collapsed into a card that said ฿1,200 twice under two
            different labels ("฿1,200 each at 1 person", then "Total ฿1,200
            NET"), advertised ฿240 each at a party size the customer had not
            selected, and split the total a fourth way. The owner's verdict was
            "too much information still, a bit confusing", and the reason it
            read that way is that only one of the four was the price.

            What is left:
              1. The TOTAL, as the headline. It is what the customer pays, it
                 does not move with the party size, and it is the figure the
                 booking is actually priced at. The per-head split rides along
                 it as a qualifier ONLY when it differs from it, so a party of
                 one sees one number and a party of two sees the divide they
                 asked for. "Total" as a word is gone with it: the headline of
                 a set card is self-evidently the set's price, and the label
                 was only ever there to stop the old per-person lead being
                 mistaken for it.
              2. The bay/food split, unchanged, one line, the case for the set.

            Deliberately NOT kept: the capacity line ("฿240 each at 5 people").
            It existed as disclosure — while the card led with a per-head
            figure, the five-head figure it was not showing had to be named. A
            total-led card has no per-head price to disclose against, which
            leaves the line arguing for a party the customer has not chosen,
            in the card's accent colour, against the price they are looking at.
            See `lib/play-food-value.ts`, which no longer computes it. */}
        <div>
          <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
            <span className="text-2xl font-bold text-green-700 tabular-nums">
              ฿{pkg.price.toLocaleString()}
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {tPkg('priceNet')}
            </span>
            {/* Still computed from the SELECTED party, never `pricePerPerson`
                (which is `price / maxPeople` and would show a five-head figure
                to a party of two). What changed is only that it is dropped when
                it has nothing to say. */}
            {value.showPerPerson && (
              <span className="text-xs text-gray-600 tabular-nums">
                {t('setPerPersonSplit', { price: value.perPerson, count: numberOfPeople })}
              </span>
            )}
          </div>
          {/* What the total is made of: the bay time this slot would cost on its
              own, plus what the food and drinks add on top.
              `foodPremium = price - bayOnlyCost`, so the two figures sum to the
              headline total on the line directly above — which is the whole
              reason this sits here rather than where it used to.
              It used to be an amber panel below the includes list: a boxed
              callout, in the card's only accent colour, roughly the weight of
              the price itself, arguing FOR the set at a distance from every
              number it referred to. As a subordinate line under the total it
              makes the same case as arithmetic the customer can check, and the
              card is left with three weights (photo, price, action) instead of
              four.
              Still generated per slot by `lib/play-food-value.ts` — bay time is
              genuinely cheaper before 14:00 than in the evening, so a fixed
              claim would be wrong for half the day — and still omitted outright
              when the premium is zero, negative or unpriceable.
              `text-gray-500`, matching the NET marker beside the total it
              decomposes, NOT the lighter
              `text-gray-400` this started as: #9ca3af on white is 2.54:1, under
              the 4.5:1 AA threshold and under even the 3:1 large-text one. It
              is subordinate to the total by size and position; making it
              subordinate by contrast as well put a pricing figure below
              legibility. #6b7280 is 4.83:1 and still reads as the quieter
              line. */}
          {value.bayOnlyCost !== null && value.foodPremium !== null && (
            <div className="mt-0.5 text-xs text-gray-500 tabular-nums">
              {t('setPriceSplit', {
                bayPrice: value.bayOnlyCost,
                premium: value.foodPremium,
              })}
            </div>
          )}
        </div>

        {/* Itemised food and drinks, unlimited vs per-person preserved. */}
        <div className="border-t border-gray-100 pt-3 flex-1">
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
