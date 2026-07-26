'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import {
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  ComputerDesktopIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import type { PlayFoodPackage } from '@/types/play-food-packages';
import type { BayType } from '@/lib/bayConfig';
import { allowedDurations, formatDurationLabel } from '@/lib/booking-durations';
import { SetMenuCard } from './SetMenuCard';
import type { TimeSlot, DurationBayAvailability } from '../../../../hooks/useAvailability';

/**
 * What the customer is buying. Not an add-on: a Play & Food set replaces the
 * hourly bay rate and fixes the booking length, which is why it gets its own
 * fork rather than a tile in a row of extras.
 */
type BookingMode = 'bay' | 'food';

export interface SessionStepProps {
  /** Longest session this slot fits, in hours. Fractional (2.5) since the
      availability function moved to v3. Caps the duration ladder. */
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
  /** Unlocks the 4 h and 5 h rungs of the duration ladder. Starts false and
      resolves from `/api/user/active-packages`, so a package holder sees the
      5-tile ladder for a moment before it becomes 7. */
  hasActivePackage: boolean;
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
  hasActivePackage,
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

  // The rungs this customer can pick at this slot: 1, 1.5, 2, 2.5, 3, plus 4
  // and 5 when they hold an active package, all capped by the slot's headroom.
  // See lib/booking-durations.ts for why 3.5 and 4.5 are not in the ladder.
  //
  // Only meaningful in Bay-only mode. Bay + food hides this whole section: the
  // sets are whole 1/2/3 h and selecting one fixes the duration, so half-hours
  // are a Bay-only affair.
  const durationOptions = allowedDurations({ maxHours: maxDuration, hasActivePackage });

  // Which side of the fork is open. Seeded from the package so a `?package=SET_B`
  // deep link (resolved by `useBookingFlow` and handed down as
  // `localSelectedPackage`) lands on Bay + food with SET_B's card selected,
  // rather than on Bay only with a package quietly selected underneath.
  const [mode, setMode] = useState<BookingMode>(localSelectedPackage ? 'food' : 'bay');

  // The deep-linked package can also arrive after this component mounts — the
  // search-param effect in `useBookingFlow` runs a tick later, and step 3 is
  // reachable with the param still pending. One-way on purpose: it opens the
  // fork on Bay + food but never forces it back to Bay only, so a customer who
  // is browsing the sets without having picked one yet is left alone.
  useEffect(() => {
    if (localSelectedPackage) setMode('food');
  }, [localSelectedPackage]);

  // Back to bay-only pricing. Preserved verbatim from the tile this replaced:
  // clearing the package also resets duration and party size, and drops the
  // `?package=` param so a refresh does not re-select it.
  const selectBayOnly = () => {
    setMode('bay');
    setLocalSelectedPackage(null);
    setDuration(1);
    setNumberOfPeople(1);
    router.replace('/bookings', { scroll: false });
  };

  // Selecting a set still fixes the duration at the set's own length — that is
  // the behaviour the cards exist to disclose, not to change.
  const selectSet = (pkg: PlayFoodPackage) => {
    setMode('food');
    setLocalSelectedPackage(pkg);
    setDuration(pkg.duration);
    router.replace(`/bookings?package=${pkg.id}`, { scroll: false });
  };

  // The date/time the bay-only anchor on each card is priced against, so the
  // comparison is true for this slot rather than for the evening rate only.
  const anchorDate = format(selectedDate, 'yyyy-MM-dd');

  // Read the cap off the selected set instead of assuming 5. Every set is
  // `maxPeople: 5` today and the picker has always topped out at 5, so this is
  // the same five tokens — but a set with a different cap would now shorten the
  // picker instead of offering seats it cannot seat. The picker lays the tokens
  // out with `flex flex-wrap` at a fixed size rather than a `grid-cols-N`
  // literal, so a genuinely variable cap needs no matching column count.
  const seatCap = localSelectedPackage?.maxPeople ?? 5;
  const peopleOptions = Array.from({ length: seatCap }, (_, i) => i + 1);

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

      {/* What are you booking? — a two-way pricing fork, not an add-on picker.
          The sets used to share a four-across row with "Bay only", which left
          each set about 60px wide: no room for a name, so they degraded to "A",
          "B", "C" and a bare total. Everything persuasive was dropped at exactly
          the moment of decision. */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-gray-700">
            {t('bookingModeLabel')}
          </label>
          <button
            type="button"
            onClick={() => setShowPackageModal(true)}
            className="text-xs text-green-600 hover:text-green-700 underline"
          >
            {t('viewDetails')}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={selectBayOnly}
            aria-pressed={mode === 'bay'}
            className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
              mode === 'bay'
                ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                : 'border-gray-300 text-gray-700 hover:border-green-600'
            }`}
          >
            <span className="font-semibold text-[11px] sm:text-xs">{t('bayOnly')}</span>
            <span className="text-[9px] sm:text-[10px] mt-0.5 opacity-75">{t('bayOnlyDescription')}</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('food')}
            aria-pressed={mode === 'food'}
            className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
              mode === 'food'
                ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                : 'border-gray-300 text-gray-700 hover:border-green-600'
            }`}
          >
            <span className="font-semibold text-[11px] sm:text-xs">{t('bayPlusFood')}</span>
            <span className="text-[9px] sm:text-[10px] mt-0.5 opacity-75">{t('bayPlusFoodDescription')}</span>
          </button>
        </div>

        {mode === 'bay' ? (
          <div className="mt-3 text-xs text-gray-500 text-center">
            {t('bayOnlyHelper')}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Bay + food is open but nothing is chosen yet, so the booking is
                still priced as a plain bay rental. Say so rather than let the
                total quietly disagree with the tab the customer is looking at. */}
            {!localSelectedPackage && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {t('setPickPrompt')}
              </p>
            )}

            {PLAY_FOOD_PACKAGES.map((pkg) => (
              <SetMenuCard
                key={pkg.id}
                pkg={pkg}
                isSelected={localSelectedPackage?.id === pkg.id}
                /* A set longer than the slot's headroom stays visible but
                   unselectable, same rule as the tile it replaced. */
                isAvailable={pkg.duration <= maxDuration}
                onSelect={() => selectSet(pkg)}
                numberOfPeople={numberOfPeople}
                date={anchorDate}
                startTime={selectedTime}
              />
            ))}
          </div>
        )}
      </div>


      {/* Duration Selection — Bay only. Selecting a set fixes the length, so the
          ladder would only offer a way to contradict it. */}
      {mode === 'bay' && (
        <div>
          <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <ClockIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
            {t('durationLabel')}
          </label>
          {/* A SEGMENTED TRACK, not a row of separate boxes. Duration is an
              ordered scale — the rungs are one continuous choice from short to
              long — and a recessed track with the selection sliding along it
              says that in a way five identical bordered tiles did not. It is
              also the idiom this very file already uses for the Social / AI Lab
              toggle above, so the flow has one shape for "pick one of these",
              not two.

              The party-size picker deliberately does NOT get this treatment.
              The two sat adjacent looking identical while meaning different
              things; a track for the scale and detached circles for the count
              is the distinction, and it survives at a glance.

              Selection is a solid `green-600` fill with white text, replacing
              `bg-green-50 text-green-600`. That tint was ~1.2:1 against the
              unselected tiles — at arm's length on a phone the picker read as
              having nothing selected at all.

              Five rungs fill `grid-cols-5` in a single row exactly, which is
              what a bay-rate customer sees. A package holder gets seven, and
              seven in a 5-column grid leaves a second row with three empty
              cells that reads as a rendering fault. So drop to four columns
              once the ladder passes five: seven lays out as 4 + 3 with one
              trailing gap. At a 360px viewport that is a ~71px tile; the
              five-rung case is ~56px. Both clear the 44px minimum in width, and
              `h-11` sets it in height.

              Both class strings are literal, not interpolated, so Tailwind's
              scanner still emits `grid-cols-4` and `grid-cols-5`. */}
          <div
            className={`grid gap-1 rounded-xl bg-gray-100 p-1 ${
              durationOptions.length > 5 ? 'grid-cols-4' : 'grid-cols-5'
            }`}
          >
            {durationOptions.map((hours) => (
              <button
                key={hours}
                type="button"
                onClick={() => setDuration(hours)}
                aria-pressed={duration === hours}
                /* `tabular-nums` so the decimal points of 1.5 and 2.5 line up
                   with each other and with the whole-hour tiles. */
                className={`flex h-11 items-center justify-center rounded-lg tabular-nums transition-colors ${
                  duration === hours
                    ? 'bg-green-600 font-semibold text-white shadow-sm'
                    : 'text-gray-700 hover:bg-white/70 active:bg-white'
                }`}
              >
                {formatDurationLabel(hours)}
              </button>
            ))}
          </div>
          {durationError && (
            <p className="mt-1 text-sm text-red-600">{durationError}</p>
          )}

          {/* Bay availability at the chosen duration. Same sentence, same three
              branches, no longer a bordered blue slab: it was the only blue on
              the page, and being a boxed panel between the two pickers it read
              as a third control rather than a footnote on the one above. As a
              quiet grey line it stays attached to the duration track it
              describes. The count keeps its emphasis via the leading span. */}
          {slotData?.bayAvailabilityByDuration && currentAvailability.total > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-600">
              <InformationCircleIcon
                className="mt-px h-4 w-4 flex-shrink-0 text-gray-400"
                aria-hidden="true"
              />
              <span>
                <span className="font-medium text-gray-900">{t('availableForDuration', { duration })}</span>
                {currentAvailability.social > 0 && currentAvailability.ai > 0 && (
                  <span>
                    {t('availableSocialOrAi', { social: currentAvailability.social, ai: currentAvailability.ai })}
                  </span>
                )}
                {currentAvailability.social > 0 && currentAvailability.ai === 0 && (
                  <span>
                    {t('availableSocialOnly', { social: currentAvailability.social })}
                  </span>
                )}
                {currentAvailability.social === 0 && currentAvailability.ai > 0 && (
                  <span>
                    {t('availableAiOnly')}
                  </span>
                )}
              </span>
            </p>
          )}
        </div>
      )}

      {/* Number of People — detached circles, on purpose.
          A party size is a count of people, not a point on a scale, so it gets
          discrete round tokens rather than the duration track's segments. The
          two pickers sit adjacent and used to be pixel-identical rows of
          bordered boxes; shape is what tells them apart now, before any label
          is read.

          `flex flex-wrap` rather than `grid-cols-5`: the column count no longer
          has to be a literal matching `maxPeople`, so a set with a cap other
          than 5 lays out on its own instead of stretching five columns or
          overflowing. Tokens are a fixed 48px, comfortably over the 44px
          minimum and unaffected by how many there are. */}
      <div>
        <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <UsersIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
          {t('numberOfPeople')}
        </label>
        <div className="flex flex-wrap gap-2">
          {peopleOptions.map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => setNumberOfPeople(num)}
              aria-pressed={numberOfPeople === num}
              className={`flex h-12 w-12 items-center justify-center rounded-full border-2 tabular-nums transition-colors ${
                numberOfPeople === num
                  ? 'border-green-600 bg-green-600 font-semibold text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-green-500'
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
