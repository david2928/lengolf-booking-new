'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  ComputerDesktopIcon,
  InformationCircleIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import { ChangeAnswerButton, RevealDetailsButton } from '../../affordances';
import type { PlayFoodPackage } from '@/types/play-food-packages';
import type { BayType } from '@/lib/bayConfig';
import { allowedDurations, formatDurationLabel } from '@/lib/booking-durations';
import { bayChoiceLabelKey } from './bayChoice';
import { SegmentedOptions } from './SegmentedOptions';
import { SetMenuCard } from './SetMenuCard';

/**
 * How each bay answer looks on the recap card.
 *
 * Keyed by `bayChoiceLabelKey`'s three-way result rather than by a fresh
 * `=== 'ai_lab'` test, which is what this used to be — and a two-way test over
 * a three-way answer has to put one of the three somewhere it does not belong.
 * "All Bays" landed in the Social branch: the same green `UsersIcon` and the
 * same `text-green-700`, pixel-identical to a Social Bay card with only the
 * word differing. The meaning was carried entirely by the label, which is the
 * one part of a card a customer scanning it does not read first.
 *
 * So no preference gets a neutral grey and a grid glyph — the visual claim
 * "any of these" rather than the visual claim "the social ones". Grey also
 * reads as unaccented next to two accented options, which is what declining to
 * choose is.
 */
const BAY_CARD_STYLE: Record<
  ReturnType<typeof bayChoiceLabelKey>,
  { iconWrap: string; icon: string; label: string }
> = {
  aiLab: { iconWrap: 'bg-purple-50', icon: 'text-purple-600', label: 'text-purple-700' },
  socialBay: { iconWrap: 'bg-green-50', icon: 'text-green-600', label: 'text-green-700' },
  anyBay: { iconWrap: 'bg-gray-100', icon: 'text-gray-500', label: 'text-gray-700' },
};

/**
 * What the customer is buying. Not an add-on: a Play & Food set replaces the
 * hourly bay rate and fixes the booking length, which is why it gets its own
 * fork rather than a tile in a row of extras.
 */
type BookingMode = 'bay' | 'food';

export interface SessionStepProps {
  /** Longest session THIS BOOKING fits, in hours — the slot's headroom already
      narrowed to what the bay type chosen on step 2 can serve (`bayTypeHeadroom`
      in `lib/booking-durations.ts`). Fractional (2.5) since the availability
      function moved to v3. Caps both the duration ladder and the Play & Food
      set cards. NOT the raw `TimeSlot.maxHours`: that is the headroom of
      whichever bay lasts longest, which is a different bay from the customer's
      whenever the two come apart. */
  maxDuration: number;
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
  // --- Selected Info Cards + AI Lab warning (moved in from BookingDetails) ---
  selectedDate: Date;
  selectedTime: string;
  /**
   * The bay type, decided once on the time step and read-only from here. `null`
   * is "All Bays" — no preference — which is a valid answer, so this step never
   * asks again and never blocks on it.
   */
  selectedBayType?: BayType | null;
  /** Already-localised bay name, including the "Any Bay" case. */
  bayLabel: string;
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
 * All three info cards are READ-ONLY recaps of choices made on earlier steps.
 * The bay card used to be the exception — a required Social / AI Lab picker
 * with an availability line under the duration ladder to feed it — which asked
 * the customer to decide a second time something the time step had already
 * settled. The choice now travels from step 2 and this step only reports it.
 */
export function SessionStep({
  maxDuration,
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
  selectedDate,
  selectedTime,
  selectedBayType,
  bayLabel,
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
  // the same five rungs — but a set with a different cap would now shorten the
  // picker instead of offering seats it cannot seat. `SegmentedOptions` reads
  // the column count off the array length, so a genuinely variable cap lays
  // itself out with no matching literal to keep in sync here.
  const seatCap = localSelectedPackage?.maxPeople ?? 5;
  const peopleOptions = Array.from({ length: seatCap }, (_, i) => i + 1);

  /* The recap card's colours and glyph, resolved through the SAME three-way
     mapping that produced `bayLabel` in `BookingDetails`. Sharing the key is
     what stops the card's appearance and its wording from disagreeing about
     which of the three answers this is. */
  const bayChoice = bayChoiceLabelKey(selectedBayType);
  const bayCardStyle = BAY_CARD_STYLE[bayChoice];
  const BayIcon =
    bayChoice === 'aiLab' ? ComputerDesktopIcon
    : bayChoice === 'socialBay' ? UsersIcon
    : Squares2X2Icon;

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

        {/* The bay, as chosen on the time step. A recap in the same shape as the
            date and start time beside it, because it is the same kind of thing:
            something already decided. No asterisk — there is nothing to
            require, "All Bays" included. */}
        <div
          data-testid="booking-bay-card"
          className="bg-white rounded-xl shadow-sm p-3 sm:p-6 border border-green-100"
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 sm:p-3 rounded-full ${bayCardStyle.iconWrap}`}>
              <BayIcon className={`h-6 w-6 sm:h-8 sm:w-8 ${bayCardStyle.icon}`} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">{t('bayType')}</h3>
              <div className="flex items-center gap-2">
                <p className={`text-lg sm:text-xl font-bold ${bayCardStyle.label}`}>
                  {bayLabel}
                </p>
                <RevealDetailsButton onClick={() => setShowBayInfoModal(true)}>
                  {t('info')}
                </RevealDetailsButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Lab Group Size Warning. The back link leaves step 3 for step 2,
          which is now exactly where the bay is chosen — and the choice survives
          the trip, so the customer lands on the control holding their current
          answer rather than on a reset one. */}
      {selectedBayType === 'ai_lab' && numberOfPeople >= 3 && (
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
              {/* The most destructive control on the sub-step: it unmounts step
                  3 entirely for step 2. It gets the strongest affordance of the
                  three, in the callout's own palette so it does not introduce a
                  second status colour inside an amber box. */}
              <ChangeAnswerButton
                onClick={onBack}
                tone="warning"
                icon={ArrowLeftIcon}
                className="mt-2"
              >
                {t('aiLabBackToSocial')}
              </ChangeAnswerButton>
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
          <RevealDetailsButton onClick={() => setShowPackageModal(true)}>
            {t('viewDetails')}
          </RevealDetailsButton>
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
          ladder would only offer a way to contradict it.

          No bay-availability line under it any more. It read "Available for 1
          hour: 3 Social Bays only" — a count that existed to inform the Social
          / AI Lab picker that used to sit directly above it. With the bay
          settled on step 2 it had nothing left to inform, and telling a
          customer what is available immediately after they have chosen from it
          is the same second-guessing the picker itself was.

          What that line WAS still doing, and what removing it briefly cost us,
          is warning that the chosen bay could not last as long as the ladder
          was offering. That is no longer a warning because it is no longer
          possible: `maxDuration` arrives capped by the chosen bay type's own
          headroom, so a rung it cannot serve is not on the ladder. The
          information the line carried is now expressed as the absence of a tile
          rather than as a count to interpret — see `bayTypeHeadroom`. Do not
          restore this comment's earlier claim that the SLOT's headroom was
          doing that job: it was not, and the gap is what let five surfaces
          promise a bay the booking would not get. */}
      {mode === 'bay' && (
        <SegmentedOptions
          label={t('durationLabel')}
          icon={ClockIcon}
          options={durationOptions}
          value={duration}
          onChange={setDuration}
          formatOption={formatDurationLabel}
          error={durationError}
        />
      )}

      {/* Same control, same idiom, deliberately. These two sit about 40px apart
          and used to be drawn differently on purpose — a track for duration,
          detached round tokens for the party — so that shape would signal
          "ordered scale" versus "count" before either label was read. On the
          screen it reads as inconsistency rather than as meaning, which is what
          the owner reported. `SegmentedOptions` carries the reasoning and is
          now the only place either picker is styled, so they cannot drift apart
          again. */}
      <SegmentedOptions
        label={t('numberOfPeople')}
        icon={UsersIcon}
        options={peopleOptions}
        value={numberOfPeople}
        onChange={setNumberOfPeople}
      />
    </>
  );
}
