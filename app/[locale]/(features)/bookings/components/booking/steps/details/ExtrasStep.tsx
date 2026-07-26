'use client';

import { useId, type ReactNode } from 'react';
import Image from 'next/image';
import { useTranslations, type useFormatter } from 'next-intl';
import { RevealDetailsButton } from '../../affordances';
import { SelectionIndicator } from './SelectionIndicator';
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
 * Every club-rental option shares this `name`, which is what makes them ONE
 * radio group.
 *
 * This is the load-bearing detail of the whole section. The options live in
 * three separate DOM containers (No Rental / Standard, the DB-driven premium
 * sets, the static fallback) and are only mutually exclusive because the code
 * overwrites two scalars. Native radios group by `name`, not by nesting, so the
 * browser now enforces "exactly one of these" across all three containers and
 * hands over arrow-key navigation and the "3 of 5" announcement for free.
 *
 * An ARIA `role="radiogroup"` would have needed one wrapper around all three
 * containers plus a hand-rolled roving tabindex. `@radix-ui/react-radio-group`
 * is not a dependency of this project and there is no `components/ui/
 * radio-group.tsx`.
 */
const CLUB_RENTAL_RADIO_GROUP = 'booking-club-rental';

interface ClubOptionRowProps {
  /** Distinguishes the radios within the group; not submitted anywhere. */
  value: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned price block. */
  trailing?: ReactNode;
  thumb?: ReactNode;
  /** Premium+ inverts to near-black green once chosen. */
  dark?: boolean;
}

/**
 * One row of the single-select club-rental list.
 *
 * All five options are the same row shape now, where No Rental and Standard
 * used to be a 2-up grid of squat tiles above the premium rows. Two layouts for
 * one question read as two questions; one column of identical rows reads as a
 * list you pick one of, which is what it is.
 *
 * The `<input>` is `sr-only` rather than `hidden` or absent: `hidden` takes it
 * out of the a11y tree and off the keyboard, which would give back exactly the
 * semantics this is here to provide. Everything visible is inside a `<label>`,
 * so a click anywhere on the row selects it, and everything is a `<span>`
 * because `<label>` takes phrasing content only.
 *
 * The focus ring is projected from the hidden input onto the row via `peer-`,
 * not `has-[:focus-visible]`: this project declares `tailwindcss: ^3.3.0` and
 * `has-` needs 3.4, so a clean install could silently drop the ring.
 */
function ClubOptionRow({
  value,
  checked,
  disabled = false,
  onSelect,
  title,
  subtitle,
  trailing,
  thumb,
  dark = false,
}: ClubOptionRowProps) {
  const selectedDark = checked && dark;
  const box = disabled
    ? 'border-gray-200 bg-gray-50 opacity-50'
    : selectedDark
      ? 'border-[#c8a96e]'
      : checked
        ? 'border-green-600 bg-green-50'
        : 'border-gray-300 hover:border-green-600';

  return (
    <label className={`block ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <input
        type="radio"
        name={CLUB_RENTAL_RADIO_GROUP}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="peer sr-only"
      />
      <span
        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-green-600 peer-focus-visible:ring-offset-1 ${box}`}
        style={selectedDark ? { backgroundColor: '#003d1f' } : undefined}
      >
        <SelectionIndicator kind="radio" selected={checked} onDark={selectedDark} />
        {thumb}
        <span className="min-w-0 flex-1">
          {title}
          {subtitle}
        </span>
        {trailing}
      </span>
    </label>
  );
}

/**
 * Extras section of booking step 3: golf club rental selection (No Rental /
 * Standard, the DB-driven premium sets, and the static fallback) and the
 * Gear Up add-ons. Renders as a fragment so the parent `<form>`'s
 * `space-y-4 sm:space-y-6` keeps applying to these blocks as direct children.
 *
 * The two groups here are adjacent and their models differ: club rental is
 * pick-one, Gear Up is pick-any. That distinction is carried by the glyph shape
 * (see `SelectionIndicator`) and by real `<input type="radio">` /
 * `<input type="checkbox">` underneath, so what assistive tech is told matches
 * what the form actually enforces. Before this the club sets had no ARIA state
 * at all and Gear Up claimed `aria-pressed` from a `<div>` drawn as a checkbox.
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
  const clubGroupLabelId = useId();

  return (
    <>
      {/* Golf Club Rental Selection */}
      <div>
        <div className="flex items-center justify-between mb-3">
          {/* A `<p>`, not a `<label>`. This heads a GROUP of controls, so there
              is nothing for a `for` to point at; the dangling `<label>` it
              replaces named nothing and left the radio group anonymous. It is
              wired to the group below through `aria-labelledby` instead. */}
          <p id={clubGroupLabelId} className="block text-sm font-medium text-gray-700">
            {t('clubRentalLabel')}
          </p>
          <RevealDetailsButton onClick={() => setShowClubRentalModal(true)}>
            {t('viewDetails')}
          </RevealDetailsButton>
        </div>

        {/* One list, one radio group. The `space-y-2` wrapper spans the fixed
            options and the DB-driven ones together so the customer sees a
            single column of equals rather than a tile row sitting above a
            different-looking card list.

            `role="radiogroup"` is belt-and-braces over the shared input `name`,
            which is what actually enforces exclusivity. What the role adds is
            the group's accessible NAME, so entering it announces "Golf Club
            Rental" rather than dropping the customer into an unlabelled run of
            radios. */}
        <div role="radiogroup" aria-labelledby={clubGroupLabelId} className="space-y-2">
          <ClubOptionRow
            value="none"
            checked={selectedClubRental === 'none'}
            onSelect={() => { onClubRentalChange?.('none'); onClubSetIdChange?.(null); }}
            title={
              <span className={`block text-xs font-semibold ${
                selectedClubRental === 'none' ? 'text-green-700' : 'text-gray-900'
              }`}>
                {t('noRental')}
              </span>
            }
            subtitle={
              <span className={`mt-0.5 block text-[11px] ${
                selectedClubRental === 'none' ? 'text-green-600/70' : 'text-gray-500'
              }`}>
                {t('noRentalDescription')}
              </span>
            }
          />

          <ClubOptionRow
            value="standard"
            checked={selectedClubRental === 'standard'}
            onSelect={() => { onClubRentalChange?.('standard'); onClubSetIdChange?.(null); }}
            title={
              <span className={`block text-xs font-semibold ${
                selectedClubRental === 'standard' ? 'text-green-700' : 'text-gray-900'
              }`}>
                {t('standardSet')}
              </span>
            }
            trailing={
              <span className={`flex-shrink-0 text-sm font-bold ${
                selectedClubRental === 'standard' ? 'text-green-700' : 'text-gray-900'
              }`}>
                {t('standardSetFree')}
              </span>
            }
          />

          {/* Premium club sets from DB with real availability */}
          {clubSetsLoading ? (
            <div className="text-xs text-gray-400 text-center py-3">{t('checkingClubAvailability')}</div>
          ) : availableClubSets.length > 0 ? (
            availableClubSets.map((clubSet) => {
              const isSelected = selectedClubSetId === clubSet.id;
              const isAvailable = clubSet.available_count > 0;
              const price = getIndoorPrice(clubSet, duration);
              const isPremiumPlus = clubSet.tier === 'premium-plus';
              const thumbUrl = getSetThumbnailUrl(clubSet);

              return (
                <ClubOptionRow
                  key={clubSet.id}
                  value={clubSet.id}
                  checked={isSelected}
                  disabled={!isAvailable}
                  dark={isPremiumPlus}
                  onSelect={() => {
                    if (!isAvailable) return;
                    onClubRentalChange?.(clubSet.tier);
                    onClubSetIdChange?.(clubSet.id);
                  }}
                  thumb={
                    thumbUrl ? (
                      <span className={`relative block w-14 h-14 rounded-md overflow-hidden flex-shrink-0 border ${
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
                      </span>
                    ) : undefined
                  }
                  title={
                    <span className="flex items-center gap-1.5">
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
                    </span>
                  }
                  subtitle={
                    <span className={`block text-[11px] mt-0.5 ${
                      isSelected && isPremiumPlus ? 'text-white/70' :
                      isSelected ? 'text-green-600/70' : 'text-gray-500'
                    }`}>
                      {clubSet.brand} {clubSet.model}
                    </span>
                  }
                  trailing={
                    <span className={`block text-right flex-shrink-0 ml-auto ${
                      isSelected && isPremiumPlus ? 'text-white' :
                      isSelected ? 'text-green-700' : 'text-gray-900'
                    }`}>
                      <span className="block font-bold text-sm">฿{price.toLocaleString()}</span>
                      <span className={`block text-[10px] ${
                        isSelected && isPremiumPlus ? 'text-white/60' : 'text-gray-400'
                      }`}>{t('clubSetDurationSuffix', { hours: duration })}</span>
                    </span>
                  }
                />
              );
            })
          ) : (
            /* Fallback if the DB fetch fails: the two tiers with no specific
               set behind them. Same rows, same group, so a failed fetch
               degrades the choices on offer without changing how choosing
               works. */
            <>
              <ClubOptionRow
                value="premium"
                checked={selectedClubRental === 'premium'}
                onSelect={() => { onClubRentalChange?.('premium'); onClubSetIdChange?.(null); }}
                title={
                  <span className={`block text-xs font-semibold ${
                    selectedClubRental === 'premium' ? 'text-green-700' : 'text-gray-900'
                  }`}>
                    {t('premiumLabel')}
                  </span>
                }
                trailing={
                  <span className={`flex-shrink-0 text-sm font-bold ${
                    selectedClubRental === 'premium' ? 'text-green-700' : 'text-gray-900'
                  }`}>
                    {t('premiumStartingFromShort')}
                  </span>
                }
              />

              <ClubOptionRow
                value="premium-plus"
                checked={selectedClubRental === 'premium-plus'}
                dark
                onSelect={() => { onClubRentalChange?.('premium-plus'); onClubSetIdChange?.(null); }}
                title={
                  <span
                    className="block text-xs font-bold"
                    style={{ color: selectedClubRental === 'premium-plus' ? '#ffffff' : '#003d1f' }}
                  >
                    {t('premiumPlusLabel')}
                  </span>
                }
                trailing={
                  <span className={`flex-shrink-0 text-sm font-bold ${
                    selectedClubRental === 'premium-plus' ? 'text-white' : 'text-gray-900'
                  }`}>
                    {t('premiumPlusStartingFromShort')}
                  </span>
                }
              />
            </>
          )}
        </div>
      </div>

      {/* Gear Up — optional add-on items sold at booking time (e.g. glove).
          Genuinely multi-select: each item is independent of the others and of
          the club choice above, so a real `<input type="checkbox">` per row is
          the honest control. It replaces a `<button aria-pressed>` wrapping a
          `<div>` that was DRAWN as a checkbox: a screen reader was told
          "toggle button, pressed" while the screen said "checkbox, ticked",
          and the tick mark was the only thing telling a sighted customer that
          this row followed a different rule from the club rows above it. */}
      {(() => {
        const gearUpItems = getGearUpItems().filter((g) => g.id === 'gloves');
        if (gearUpItems.length === 0) return null;
        return (
          <div>
            <p className="block text-sm font-medium text-gray-700 mb-3">
              {t('gearUpLabel')}
            </p>
            <div className="grid grid-cols-1 gap-2">
              {gearUpItems.map((item) => {
                const isSelected = !!selectedAddOns[item.id];
                return (
                  <label key={item.id} className="block cursor-pointer">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={isSelected}
                      onChange={() =>
                        onAddOnsChange?.({ ...selectedAddOns, [item.id]: !isSelected })
                      }
                    />
                    <span
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-green-600 peer-focus-visible:ring-offset-1 ${
                        isSelected
                          ? 'border-green-600 bg-green-50 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-green-300'
                      }`}
                    >
                      {/* Leading, exactly where the club rows put their radio.
                          Same position and size, different shape: the shape is
                          the whole message. */}
                      <SelectionIndicator kind="checkbox" selected={isSelected} />
                      <span className={`relative block w-16 h-16 rounded-md overflow-hidden flex-shrink-0 border ${
                        isSelected ? 'bg-white border-green-200' : 'bg-gray-50 border-gray-200'
                      }`}>
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          sizes="64px"
                          className="object-contain p-1"
                        />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold text-sm text-gray-900 leading-tight">{item.name}</span>
                        {item.description && (
                          <span className="block text-[11px] text-gray-500 mt-0.5 leading-snug">{item.description}</span>
                        )}
                      </span>
                      <span className="flex-shrink-0 text-sm font-bold text-green-700">
                        ฿{formatter.number(item.price)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })()}
    </>
  );
}
