'use client';

import { useEffect, useMemo } from 'react';
import { format, addDays, isToday, isTomorrow } from 'date-fns';
import { th, enUS, ja, zhCN } from 'date-fns/locale';
import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';
// "Today" already exists in the booking catalog; duplicating it into the
// membership one would give the same word two translations to drift apart.
import { bookingTranslations } from '@/lib/liff/booking-translations';
import TimeSlotList, { type TimeSlot } from '@/components/liff/booking/TimeSlotList';
import { bayTypeHeadroom } from '@/lib/booking-durations';
import { MAX_PEOPLE, MIN_PEOPLE, computeEndTime, localCalendarDate } from '@/lib/booking-edit-rules';
import type { BayType } from '@/lib/bayConfig';

export interface EditableBooking {
  id: string;
  date: string;
  startTime: string;
  duration: number;
  /** 'ai' | 'social', as the LIFF detail API reports it. */
  bayType: string;
  numberOfPeople: number;
}

export interface EditSelection {
  date: string;
  startTime: string;
  duration: number;
  numberOfPeople: number;
}

interface EditBookingFormProps {
  booking: EditableBooking;
  language: Language;
  selection: EditSelection;
  onSelectionChange: (next: EditSelection) => void;
  /** Raw availability for the selected date, already excluding this booking. */
  slots: TimeSlot[];
  isLoadingSlots: boolean;
  onDateChange: (date: string) => void;
}

/**
 * The LIFF edit form.
 *
 * Reuses `TimeSlotList` from the create flow verbatim so the two surfaces cannot
 * drift; the date and duration pickers are the create flow's patterns rebuilt
 * for this screen, because their originals carry marketing cards and an
 * opening-hours block that do not belong in an edit.
 */
export default function EditBookingForm({
  booking,
  language,
  selection,
  onSelectionChange,
  slots,
  isLoadingSlots,
  onDateChange,
}: EditBookingFormProps) {
  const t = membershipTranslations[language];
  const tb = bookingTranslations[language];
  const locale = language === 'th' ? th : language === 'ja' ? ja : language === 'zh' ? zhCN : enUS;

  const bayType: BayType = booking.bayType === 'ai' ? 'ai_lab' : 'social';
  // Computed once per mount. `today` is intentionally outside the dependency
  // array: a fresh `new Date()` every render would make the memo useless and
  // rebuild the four buttons on every keystroke elsewhere in the form.
  const today = useMemo(() => new Date(), []);
  const quickDates = useMemo(() => Array.from({ length: 4 }, (_, i) => addDays(today, i)), [today]);

  /**
   * Slots this booking can actually take, capped to what its own bay type can
   * serve. Without the cap an AI Lab booking would be offered a slot where only
   * social bays are free, and the server would then refuse the move.
   */
  const offerable = useMemo(
    () =>
      slots
        .map((slot) => ({
          slot,
          headroom: bayTypeHeadroom({
            bayAvailabilityByDuration: slot.bayAvailabilityByDuration,
            bayType,
            maxHours: slot.maxHours,
          }),
        }))
        .filter(({ headroom }) => headroom >= 1)
        // TimeSlotList prints `maxHours`, so hand it the bay-type-capped number
        // rather than the raw one it would otherwise advertise.
        .map(({ slot, headroom }) => ({ ...slot, maxHours: headroom })),
    [slots, bayType]
  );

  const selectedSlot = offerable.find((slot) => slot.time === selection.startTime) ?? null;

  const isOriginalDate = selection.date === booking.date;
  const isOriginalSlot = isOriginalDate && selection.startTime === booking.startTime;

  // LIFF's create flow offers whole hours only; keep parity so a customer does
  // not see a 1.5 h option here that they could not have booked in the first
  // place.
  const maxDuration = Math.min(Math.floor(selectedSlot?.maxHours ?? booking.duration), 5);

  const durationOptions = useMemo(() => {
    const whole = Array.from({ length: Math.max(1, maxDuration) }, (_, i) => i + 1);

    // Half-hour and other off-ladder lengths are real in the data (0.5 h alone
    // accounts for a few hundred customer bookings, and 1.5 h is ordinary since
    // the v3 slots function shipped). While the customer is still on their own
    // slot that length is by definition bookable, so it must be offered —
    // otherwise the clamp below fires before they touch anything and quietly
    // rounds their booking, which for 1.5 h means losing half an hour they paid
    // for and for 0.5 h means gaining one they did not.
    if (isOriginalSlot && !whole.includes(booking.duration)) {
      return [...whole, booking.duration].sort((a, b) => a - b);
    }
    return whole;
  }, [maxDuration, isOriginalSlot, booking.duration]);

  // A duration the newly chosen slot cannot fit has to give way.
  useEffect(() => {
    if (durationOptions.length === 0) return;
    if (durationOptions.includes(selection.duration)) return;
    onSelectionChange({
      ...selection,
      duration: durationOptions[durationOptions.length - 1],
    });
  }, [durationOptions, selection, onSelectionChange]);

  return (
    <div className="space-y-4">
      {/* Date */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <h2 className="text-base font-semibold text-gray-900 mb-3">{t.selectNewDate}</h2>

        <div className="grid grid-cols-4 gap-2 mb-3">
          {quickDates.map((date) => {
            const value = format(date, 'yyyy-MM-dd');
            const selected = value === selection.date;
            return (
              <button
                key={value}
                onClick={() => onDateChange(value)}
                className={`p-3 rounded-xl text-center transition-all ${
                  selected
                    ? 'bg-primary text-white shadow-lg ring-2 ring-primary ring-offset-2'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div
                  className={`text-[10px] font-semibold uppercase ${selected ? 'text-white/80' : 'text-gray-500'}`}
                >
                  {isToday(date)
                    ? tb.today
                    : isTomorrow(date)
                      ? { en: 'TMR', th: 'พรุ่งนี้', ja: '明日', zh: '明天' }[language]
                      : format(date, 'EEE', { locale })}
                </div>
                <div className="text-2xl font-bold mt-0.5">{format(date, 'd')}</div>
                <div className={`text-[10px] ${selected ? 'text-white/70' : 'text-gray-400'}`}>
                  {format(date, 'MMM', { locale })}
                </div>
              </button>
            );
          })}
        </div>

        {/*
          A native <input type="date"> overlaid at opacity 0 on top of the visual
          button. iOS Safari and the LIFF WebView do not support showPicker() on
          a hidden input, so the tap has to land on the real control. 16px font
          size stops iOS zooming the page on focus.
        */}
        <div className="relative">
          <input
            type="date"
            min={format(today, 'yyyy-MM-dd')}
            value={selection.date}
            onChange={(e) => e.target.value && onDateChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            style={{ fontSize: '16px' }}
            aria-label={t.otherDate}
          />
          <div
            className={`w-full py-3 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 pointer-events-none ${
              quickDates.some((d) => format(d, 'yyyy-MM-dd') === selection.date)
                ? 'bg-gray-100 text-gray-700'
                : 'bg-primary text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            {quickDates.some((d) => format(d, 'yyyy-MM-dd') === selection.date)
              ? t.otherDate
              : format(localCalendarDate(selection.date), 'EEEE, MMM d', { locale })}
          </div>
        </div>
      </div>

      {/* Time */}
      <TimeSlotList
        language={language}
        slots={offerable}
        selectedSlot={selectedSlot}
        onSlotSelect={(slot) => onSelectionChange({ ...selection, startTime: slot.time })}
        isLoading={isLoadingSlots}
      />

      {isOriginalDate && !isLoadingSlots && offerable.length > 0 && (
        <p className="px-1 text-xs text-gray-500">{t.currentTimeLabel}</p>
      )}

      {/* Duration + guests */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-2">{t.durationLabel}</h2>
          <div className="grid grid-cols-5 gap-2">
            {durationOptions.map((hours) => (
              <button
                key={hours}
                onClick={() => onSelectionChange({ ...selection, duration: hours })}
                className={`py-3 rounded-lg text-sm font-medium transition-all ${
                  selection.duration === hours
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {hours}
                {language === 'en' ? 'h' : ''}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-2">{t.guests}</h2>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: MAX_PEOPLE - MIN_PEOPLE + 1 }, (_, i) => MIN_PEOPLE + i).map(
              (count) => (
                <button
                  key={count}
                  onClick={() => onSelectionChange({ ...selection, numberOfPeople: count })}
                  className={`py-3 rounded-lg text-sm font-medium transition-all ${
                    selection.numberOfPeople === count
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {count}
                </button>
              )
            )}
          </div>
        </div>

        <p className="text-xs text-gray-500">
          {bayType === 'ai_lab' ? t.bayNoteAiLab : t.bayNoteSocial}
        </p>
      </div>
    </div>
  );
}

/** `19:00` + 2 -> `19:00 - 21:00`. Exported so the review screen reads the same. */
export function slotRange(startTime: string, duration: number): string {
  return `${startTime} - ${computeEndTime(startTime, duration)}`;
}
