'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import {
  ClockIcon,
  SunIcon,
  CloudIcon,
  MoonIcon,
  UsersIcon,
  ComputerDesktopIcon
} from '@heroicons/react/24/outline';
import { useAvailability, type TimeSlot } from '../../../hooks/useAvailability';
import { BayType } from '@/lib/bayConfig';
import { BayInfoModal } from '../../BayInfoModal';
import {
  BOOKING_PERIODS,
  getBookingPeriod,
  periodHourCaptionArgs,
  type BookingPeriod,
} from '@/lib/booking-periods';

interface TimeSlotsProps {
  selectedDate: Date;
  onBack: () => void;
  onTimeSelect: (time: string, maxHours: number, bayType?: BayType, slotData?: TimeSlot) => void;
}

type BayFilterType = 'all' | 'social' | 'ai_lab';

export function TimeSlots({ selectedDate, onTimeSelect }: TimeSlotsProps) {
  const t = useTranslations('bookings.timeStep');
  const { isLoadingSlots, availableSlots, fetchAvailability } = useAvailability();
  const [bayFilter, setBayFilter] = useState<BayFilterType>('all');
  const [showBayInfoModal, setShowBayInfoModal] = useState(false);

  useEffect(() => {
    fetchAvailability(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]); // fetchAvailability excluded to prevent race conditions

  // Filter slots based on bay type selection
  const filterSlotsByBayType = (slots: TimeSlot[], filterType: BayFilterType): TimeSlot[] => {
    if (filterType === 'all') return slots;

    return slots.filter(slot => {
      if (!slot.availableBays) return false;

      if (filterType === 'social') {
        return slot.socialBayCount && slot.socialBayCount > 0;
      } else if (filterType === 'ai_lab') {
        return slot.aiLabCount && slot.aiLabCount > 0;
      }

      return false;
    });
  };

  const filteredSlots = filterSlotsByBayType(availableSlots, bayFilter);

  // The morning caption's start hour is the venue's opening hour, which is
  // date-dependent — see `lib/opening-hours.ts`.
  const dateKey = format(selectedDate, 'yyyy-MM-dd');

  // Counts come off the FILTERED list, so the tabs never advertise a slot the
  // current bay filter has already hidden.
  const slotsByPeriod = BOOKING_PERIODS.reduce(
    (acc, period) => {
      acc[period] = filteredSlots
        .filter(slot => getBookingPeriod(slot.startTime) === period)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      return acc;
    },
    {} as Record<BookingPeriod, TimeSlot[]>,
  );

  /**
   * The period holding the next bookable slot. `BOOKING_PERIODS` is ordered
   * earliest-first and the availability API already drops elapsed slots for
   * today, so the first period with anything in it IS the one containing the
   * next bookable slot — no separate is-today branch needed. Null only when the
   * filtered list is empty, in which case the empty state renders instead.
   */
  const defaultPeriod = BOOKING_PERIODS.find(period => slotsByPeriod[period].length > 0) ?? null;

  const [preferredPeriod, setPreferredPeriod] = useState<BookingPeriod | null>(null);

  // A new date is a new decision — don't carry yesterday's tab over.
  useEffect(() => {
    setPreferredPeriod(null);
  }, [selectedDate]);

  /**
   * Derived rather than stored: if the bay filter empties the tab the customer
   * picked, they fall back to the default instead of being stranded on a blank
   * panel. Flipping the filter back restores their choice.
   */
  const activePeriod =
    preferredPeriod && slotsByPeriod[preferredPeriod].length > 0 ? preferredPeriod : defaultPeriod;

  // Get the appropriate bay type to pass to onTimeSelect
  const getBayTypeForSelection = (): BayType | undefined => {
    if (bayFilter === 'social') return 'social';
    if (bayFilter === 'ai_lab') return 'ai_lab';

    // For 'all' filter, let user choose in the booking details form
    if (bayFilter === 'all') return undefined;

    return undefined;
  };

  // Bay Filter Component
  const BayTypeFilter = () => (
    <div className="mb-4">
      <div className="grid grid-cols-3 gap-2 mb-3">
        <button
          onClick={() => setBayFilter('all')}
          className={`px-3 py-2.5 rounded-lg font-medium transition-colors text-center text-sm ${
            bayFilter === 'all'
              ? 'bg-gray-800 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {t('filterAllBays')}
        </button>
        <button
          onClick={() => setBayFilter('social')}
          className={`px-3 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 text-sm ${
            bayFilter === 'social'
              ? 'bg-green-600 text-white'
              : 'bg-green-50 text-green-700 hover:bg-green-100'
          }`}
        >
          <UsersIcon className="h-4 w-4 flex-shrink-0" />
          <span className="hidden sm:inline">{t('filterSocialFull')}</span>
          <span className="sm:hidden">{t('filterSocialShort')}</span>
        </button>
        <button
          onClick={() => setBayFilter('ai_lab')}
          className={`px-3 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 text-sm ${
            bayFilter === 'ai_lab'
              ? 'bg-purple-600 text-white'
              : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
          }`}
        >
          <ComputerDesktopIcon className="h-4 w-4 flex-shrink-0" />
          <span>{t('filterAiLab')}</span>
        </button>
      </div>
      
      {/* Learn More Button */}
      <div className="text-center">
        <button
          onClick={() => setShowBayInfoModal(true)}
          className="text-sm text-gray-600 hover:text-gray-800 underline transition-colors"
        >
          ❓ {t('whatsTheDifference')}
        </button>
      </div>
    </div>
  );

  const periodLabel: Record<BookingPeriod, string> = {
    morning: t('periodMorning'),
    afternoon: t('periodAfternoon'),
    evening: t('periodEvening'),
  };

  const periodIcon = (period: BookingPeriod, className: string) =>
    period === 'morning' ? (
      <SunIcon className={className} />
    ) : period === 'afternoon' ? (
      <CloudIcon className={className} />
    ) : (
      <MoonIcon className={className} />
    );

  /**
   * Below `lg` the three period cards stacked into a long scroll. This picks
   * one. Desktop keeps all three side by side and never sees the strip — it is
   * `display: none` there, so it leaves the desktop a11y tree too.
   *
   * NOT an ARIA tab pattern, deliberately. At `lg` all three cards render at
   * once, side by side; they are not tab panels at that breakpoint, so
   * `role="tabpanel"` would be a lie half the time. What this control actually
   * is, is a filter over which period the small screen shows — hence
   * `role="group"` with `aria-pressed` toggle buttons, which promises only
   * Tab-to-each-and-activate and delivers exactly that. `role="tablist"` would
   * promise Left/Right roving-tabindex navigation we do not implement.
   *
   * A period with nothing in it stays visible and FOCUSABLE, marked
   * `aria-disabled` rather than `disabled`: the count is the whole point of
   * showing it (so "sold out" is distinguishable from "not looked at yet"
   * without tapping through), and the native `disabled` attribute would drop
   * it out of the tab order and put that information out of reach of exactly
   * the users who cannot see the greyed-out styling. `aria-disabled` does not
   * block activation, so the click handler guards instead.
   *
   * Plain JSX rather than an inline component: an inline component would be a
   * new type on every render, so React would remount the strip and blow away
   * the focus ring the moment a keyboard user activated a button.
   */
  // Named "strip", not "tabs" — see above. The `periodTabsLabel` /
  // `periodTabAria` message KEYS keep their names to avoid a five-catalog
  // rename with no user-visible effect; their values say nothing about tabs.
  const periodStrip = (
    <div
      role="group"
      aria-label={t('periodTabsLabel')}
      className="lg:hidden grid grid-cols-3 gap-2 mb-4"
    >
      {BOOKING_PERIODS.map((period) => {
        const count = slotsByPeriod[period].length;
        const isActive = period === activePeriod;
        const isEmpty = count === 0;
        return (
          <button
            key={period}
            type="button"
            aria-pressed={isActive}
            aria-disabled={isEmpty}
            // Starts with the visible label, so voice control still matches.
            // The count is `aria-hidden` in the markup and carried here
            // instead, including the "no times available" =0 case.
            aria-label={t('periodTabAria', { period: periodLabel[period], count })}
            // `aria-disabled` is advisory only — enforce it here.
            onClick={() => {
              if (isEmpty) return;
              setPreferredPeriod(period);
            }}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[3.5rem] px-1 py-2 rounded-lg border transition-colors ${
              isEmpty
                ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                : isActive
                ? 'border-green-700 bg-green-700 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-green-500 hover:bg-green-50'
            }`}
          >
            {periodIcon(period, `h-4 w-4 flex-shrink-0 ${isEmpty ? 'opacity-60' : ''}`)}
            <span className="text-xs font-medium leading-tight">{periodLabel[period]}</span>
            <span
              aria-hidden="true"
              className={`text-[11px] leading-none tabular-nums ${
                isEmpty ? '' : isActive ? 'text-white/80' : 'text-gray-500'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-32rem)]">
      <BayTypeFilter />

      {isLoadingSlots ? (
        <div className="flex flex-col items-center justify-center h-full py-20">
          <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-lg text-gray-600">{t('loadingTimes')}</p>
        </div>
      ) : (
        <>
          {filteredSlots.length > 0 && periodStrip}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
          {BOOKING_PERIODS.map((period) => {
            // NOT `slot.period` — that server field splits the morning at 12 and
            // contradicts the hour caption rendered below it.
            const periodSlots = slotsByPeriod[period];
            if (periodSlots.length === 0) return null;

            return (
              <div
                key={period}
                data-testid={`period-card-${period}`}
                // One card below `lg`, all three side by side at `lg` and up.
                // `hidden` removes the others from the mobile layout entirely
                // rather than duplicating the markup per breakpoint.
                className={`bg-white rounded-xl shadow-sm overflow-hidden ${
                  period === activePeriod ? '' : 'hidden lg:block'
                }`}
              >
                {/* Period Header */}
                <div className="bg-green-700 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center">
                    {periodIcon(
                      period,
                      `h-5 w-5 mr-2 ${
                        period === 'morning'
                          ? 'text-yellow-300'
                          : period === 'afternoon'
                          ? 'text-white'
                          : 'text-blue-200'
                      }`,
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {periodLabel[period]}
                        <span className="ml-2 text-sm font-normal opacity-90">
                          {t('periodHours', periodHourCaptionArgs(period, dateKey))}
                        </span>
                      </h3>
                    </div>
                  </div>
                </div>

                {/* Time Slots - Paired by hour */}
                <div className="divide-y">
                  {(() => {
                    const sorted = periodSlots; // already sorted by `slotsByPeriod`
                    const bayType = getBayTypeForSelection();

                    // Group into pairs by hour: [12:00, 12:30], [13:00, 13:30], etc.
                    const pairs: [TimeSlot, TimeSlot | null][] = [];
                    let i = 0;
                    while (i < sorted.length) {
                      const current = sorted[i];
                      const next = sorted[i + 1];
                      const currentMin = current.startTime.split(':')[1];
                      if (currentMin === '00' && next && next.startTime.split(':')[1] === '30'
                          && next.startTime.split(':')[0] === current.startTime.split(':')[0]) {
                        pairs.push([current, next]);
                        i += 2;
                      } else {
                        pairs.push([current, null]);
                        i += 1;
                      }
                    }

                    const renderTimeButton = (slot: TimeSlot) => {
                      const limited = slot.maxHours <= 2;
                      return (
                        <button
                          onClick={() => onTimeSelect(slot.startTime, slot.maxHours, bayType, slot)}
                          className={`flex flex-col items-center justify-center h-12 w-full rounded-lg border transition-colors ${
                            limited
                              ? 'border-amber-200 bg-amber-50/50 hover:border-amber-400 hover:bg-amber-50'
                              : 'border-gray-200 hover:border-green-500 hover:bg-green-50'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <ClockIcon className={`h-4 w-4 flex-shrink-0 ${limited ? 'text-amber-600' : 'text-green-700'}`} />
                            <span className={`text-base font-semibold ${limited ? 'text-amber-700' : 'text-green-800'}`}>{slot.startTime}</span>
                          </span>
                          {limited && (
                            <span className="text-[10px] text-amber-600 font-medium -mt-0.5">{t('hoursMaxLabel', { hours: slot.maxHours })}</span>
                          )}
                        </button>
                      );
                    };

                    return pairs.map(([primary, half], pairIndex) => (
                      <motion.div
                        key={pairIndex}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2, delay: pairIndex * 0.05 }}
                        className="px-4 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex-1">{renderTimeButton(primary)}</div>
                          <div className="flex-1">{half ? renderTimeButton(half) : null}</div>
                        </div>
                      </motion.div>
                    ));
                  })()}
                </div>
              </div>
            );
          })}
          {filteredSlots.length === 0 && !isLoadingSlots && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="lg:col-span-3 flex items-center justify-center"
            >
              <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <p className="text-gray-600 text-lg">
                  {availableSlots.length === 0
                    ? t('noSlots')
                    : t('noSlotsForFilter', {
                        filter: bayFilter === 'social'
                          ? t('filterLabelSocial')
                          : bayFilter === 'ai_lab'
                          ? t('filterLabelAiLab')
                          : '',
                      })
                  }
                </p>
                {availableSlots.length > 0 && bayFilter !== 'all' && (
                  <button
                    onClick={() => setBayFilter('all')}
                    className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    {t('showAllAvailable')}
                  </button>
                )}
              </div>
            </motion.div>
          )}
          </motion.div>
        </>
      )}

      {/* Bay Information Modal */}
      <BayInfoModal 
        isOpen={showBayInfoModal} 
        onClose={() => setShowBayInfoModal(false)} 
      />
    </div>
  );
} 