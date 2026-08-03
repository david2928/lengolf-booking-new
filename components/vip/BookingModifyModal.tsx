'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { format as formatDate } from 'date-fns';
import { CalendarIcon, ClockIcon, UsersIcon } from '@heroicons/react/24/outline';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SegmentedOptions } from '@/components/shared/SegmentedOptions';
import { useAvailability, type TimeSlot } from '@/app/[locale]/(features)/bookings/hooks/useAvailability';
import { ALL_DURATIONS, bayTypeHeadroom, formatDurationLabel } from '@/lib/booking-durations';
import { BOOKING_PERIODS, getBookingPeriod, type BookingPeriod } from '@/lib/booking-periods';
import {
  MAX_CUSTOMER_NOTES_LENGTH,
  MAX_PEOPLE,
  MIN_PEOPLE,
  clampDuration,
  computeEndTime,
  deriveBayType,
  editDurationOptions,
  localCalendarDate,
} from '@/lib/booking-edit-rules';
import { modifyVipBooking } from '../../lib/vipService';
import { VipApiError } from '../../types/vip';
import type {
  ModifyVipBookingChanges,
  ModifyVipBookingErrorCode,
  VipBooking,
} from '../../types/vip';
import { getBangkokDateString, parseBangkokDate } from '@/utils/date';

interface BookingModifyModalProps {
  booking: VipBooking;
  isOpen: boolean;
  onClose: () => void;
  /** Fired once the server has confirmed the change, with the fields it changed. */
  onBookingModified: (bookingId: string, changes: ModifyVipBookingChanges) => void;
}

type Stage = 'form' | 'review' | 'success';

/**
 * Server error codes that describe the SLOT rather than the booking. These send
 * the customer back to the picker with fresh availability; everything else is a
 * dead end they cannot fix by choosing a different time.
 */
const SLOT_ERROR_CODES: ReadonlySet<string> = new Set([
  'SLOT_UNAVAILABLE',
  'CLUB_SET_UNAVAILABLE',
  'PACKAGE_EXPIRED',
  'NEW_TIME_IN_PAST',
]);

const BookingModifyModal: React.FC<BookingModifyModalProps> = ({
  booking,
  isOpen,
  onClose,
  onBookingModified,
}) => {
  const t = useTranslations('vip.bookings');
  const format = useFormatter();
  const { isLoadingSlots, availableSlots, fetchAvailability } = useAvailability();

  const [stage, setStage] = useState<Stage>('form');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);

  /**
   * The working date is a `yyyy-MM-dd` STRING, never a Date.
   *
   * Holding a Date and formatting it back with `date-fns` reads local getters,
   * so a Bangkok instant renders as the previous day for any browser west of
   * +07 — the modal would open already "changed", fetch the wrong day's slots,
   * and submit an edit one day early while the Bangkok-pinned review screen
   * showed both sides as identical. Keeping the string authoritative removes the
   * round trip entirely.
   */
  const [dateString, setDateString] = useState(booking.date);
  const [startTime, setStartTime] = useState(booking.startTime);
  const [duration, setDuration] = useState(booking.duration);
  const [people, setPeople] = useState(booking.numberOfPeople || 1);
  const [notes, setNotes] = useState(booking.notes ?? '');
  const [confirmedChanges, setConfirmedChanges] = useState<ModifyVipBookingChanges>({});

  const bayType = useMemo(() => deriveBayType(booking.bay), [booking.bay]);
  const isOriginalDate = dateString === booking.date;

  /** Local-midnight, for the calendar widget and the availability hook — both
   *  read local getters. Display goes through `bangkokInstant` instead. */
  const calendarDate = useMemo(() => localCalendarDate(dateString), [dateString]);

  // Availability is fetched with this booking EXCLUDED, so the customer's own
  // slot shows as free rather than as the thing blocking them.
  useEffect(() => {
    if (!isOpen || stage !== 'form') return;
    void fetchAvailability(calendarDate, booking.id);
  }, [isOpen, stage, calendarDate, booking.id, fetchAvailability]);

  /**
   * Slots this booking could actually move to.
   *
   * Filtered by the CURRENT bay type's headroom, not the raw `maxHours`: a slot
   * where only a social bay is free is not offerable to an AI Lab booking, and
   * showing it would promise a bay the edit will refuse. `bayTypeHeadroom`
   * already encodes that rule for the create flow.
   */
  const offerableSlots = useMemo(
    () =>
      availableSlots
        .map((slot) => ({
          slot,
          headroom: bayTypeHeadroom({
            bayAvailabilityByDuration: slot.bayAvailabilityByDuration,
            bayType,
            maxHours: slot.maxHours,
          }),
        }))
        .filter(({ headroom }) => headroom >= 1),
    [availableSlots, bayType]
  );

  const slotsByPeriod = useMemo(() => {
    const grouped: Record<BookingPeriod, { slot: TimeSlot; headroom: number }[]> = {
      morning: [],
      afternoon: [],
      evening: [],
    };
    for (const entry of offerableSlots) {
      grouped[getBookingPeriod(entry.slot.startTime)].push(entry);
    }
    return grouped;
  }, [offerableSlots]);

  const selectedHeadroom = useMemo(() => {
    const match = offerableSlots.find(({ slot }) => slot.startTime === startTime);
    // Falling back to the current duration keeps the ladder from collapsing to
    // 1 h while availability is still loading, which would silently reset a
    // customer's 2 h booking the moment they opened the modal.
    return match?.headroom ?? duration;
  }, [offerableSlots, startTime, duration]);

  const isOriginalSlot = isOriginalDate && startTime === booking.startTime;

  const durationOptions = useMemo(
    () =>
      editDurationOptions({
        bookingDuration: booking.duration,
        headroom: selectedHeadroom,
        isOriginalSlot,
        wholeHoursOnly: false,
        // 4 and 5 hours are package-holder rungs on create. Entitlement is not
        // re-derived here, so they are offered only to a booking already that long.
        hasActivePackage: booking.duration > 3,
        ladder: ALL_DURATIONS,
      }),
    [selectedHeadroom, booking.duration, isOriginalSlot]
  );

  // A duration that no longer fits the chosen slot has to give way, or the
  // review screen would show a length the server will reject. Downwards only —
  // see `clampDuration`.
  useEffect(() => {
    setDuration((current) => clampDuration(current, durationOptions));
  }, [durationOptions]);

  const pendingChanges = useMemo(() => {
    const trimmedNotes = notes.trim();
    const originalNotes = (booking.notes ?? '').trim();
    return {
      date: dateString !== booking.date,
      startTime: startTime !== booking.startTime,
      duration: duration !== booking.duration,
      people: people !== (booking.numberOfPeople || 1),
      notes: trimmedNotes !== originalNotes,
    };
  }, [dateString, startTime, duration, people, notes, booking]);

  const hasChanges = Object.values(pendingChanges).some(Boolean);

  const resetAndClose = useCallback(() => {
    setStage('form');
    setError(null);
    setIsSaving(false);
    setShowCalendar(false);
    onClose();
  }, [onClose]);

  const messageForCode = useCallback(
    (code: string | undefined, payload: Record<string, unknown> | undefined): string => {
      switch (code as ModifyVipBookingErrorCode) {
        case 'SLOT_UNAVAILABLE':
          // The distinction matters: "everything is full" and "the AI Lab is
          // full but social bays are free" lead to different next actions.
          return payload?.otherBayTypeAvailable && bayType === 'ai_lab'
            ? t('errSlotUnavailableSameType')
            : t('errSlotUnavailable');
        case 'CLUB_SET_UNAVAILABLE':
          return t('errClubSetUnavailable');
        case 'PACKAGE_EXPIRED':
          return t('errPackageExpired');
        case 'CREDIT_INVARIANT':
          return t('errCreditInvariant', { hours: Number(payload?.creditHours ?? 0) });
        case 'DURATION_LOCKED':
          return t('errDurationLocked');
        case 'OUTSIDE_OPENING_HOURS':
          return t('errOutsideOpeningHours');
        case 'COACHING_NOT_EDITABLE':
          return t('errCoaching');
        case 'TOO_LATE_TO_EDIT':
          return t('errTooLateToEdit');
        case 'BOOKING_IN_PAST':
          return t('errBookingInPast');
        case 'STATE_CHANGED':
          return t('errStateChanged');
        default:
          return t('errEditDefault');
      }
    },
    [t, bayType]
  );

  const handleConfirm = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await modifyVipBooking(booking.id, {
        ...(pendingChanges.date ? { date: dateString } : {}),
        ...(pendingChanges.startTime ? { start_time: startTime } : {}),
        ...(pendingChanges.duration ? { duration } : {}),
        ...(pendingChanges.people ? { number_of_people: people } : {}),
        ...(pendingChanges.notes ? { customer_notes: notes.trim() || null } : {}),
      });

      setConfirmedChanges(response.changes ?? {});
      setStage('success');
      onBookingModified(booking.id, response.changes ?? {});
    } catch (e: unknown) {
      if (e instanceof VipApiError) {
        const payload = e.payload as (Record<string, unknown> & { code?: string }) | undefined;
        setError(messageForCode(payload?.code, payload));
        // A slot problem is recoverable by picking again, so go back to the
        // picker and refresh it rather than stranding them on the review screen.
        if (payload?.code && SLOT_ERROR_CODES.has(payload.code)) {
          setStage('form');
          void fetchAvailability(calendarDate, booking.id);
        }
      } else {
        setError(t('errEditDefault'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Display a `yyyy-MM-dd` through the Bangkok-pinned next-intl formatter.
   *
   * Takes the string, not a Date, so there is no local-getter round trip to get
   * wrong: `parseBangkokDate` produces the correct instant and next-intl renders
   * it in Asia/Bangkok, which is the same answer in every browser.
   */
  const longDate = (iso: string) =>
    format.dateTime(parseBangkokDate(iso), {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    });

  const slotRange = (start: string, hours: number) =>
    `${start} - ${computeEndTime(start, hours)}`;

  // Bangkok's calendar day, not the browser's: a customer in London at 19:00 is
  // already on tomorrow in Bangkok, and "Today" has to mean the venue's today.
  // Milliseconds, not `addDays`: `addDays` preserves the local wall clock, so
  // across a DST transition in the browser's zone it advances 23 or 25 hours and
  // the chip can skip a day. Bangkok has no DST, so +24h is exact.
  const todayISO = getBangkokDateString();
  const tomorrowISO = getBangkokDateString(new Date(Date.now() + 86_400_000));
  const calendarToday = localCalendarDate(todayISO);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && resetAndClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {stage === 'success' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                {t('editSuccessTitle')}
              </DialogTitle>
              <DialogDescription>{t('editSuccessBody')}</DialogDescription>
            </DialogHeader>

            <div className="my-4 space-y-2 rounded-lg border border-gray-100 bg-white p-3 text-sm">
              {confirmedChanges.date && (
                <ChangeRow
                  label={t('editDateLabel')}
                  from={longDate(confirmedChanges.date.from)}
                  to={longDate(confirmedChanges.date.to)}
                />
              )}
              {(confirmedChanges.start_time || confirmedChanges.duration) && (
                <ChangeRow
                  label={t('editTimeLabel')}
                  from={slotRange(
                    confirmedChanges.start_time?.from ?? booking.startTime,
                    confirmedChanges.duration?.from ?? booking.duration
                  )}
                  to={slotRange(
                    confirmedChanges.start_time?.to ?? startTime,
                    confirmedChanges.duration?.to ?? duration
                  )}
                />
              )}
              {confirmedChanges.number_of_people && (
                <ChangeRow
                  label={t('editPeopleLabel')}
                  from={String(confirmedChanges.number_of_people.from ?? '')}
                  to={String(confirmedChanges.number_of_people.to ?? '')}
                />
              )}
              <p className="pt-1 text-xs text-gray-500">{t('editSuccessEmailNote')}</p>
            </div>

            <DialogFooter>
              <Button onClick={resetAndClose} className="w-full">
                {t('done')}
              </Button>
            </DialogFooter>
          </>
        ) : stage === 'review' ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('reviewTitle')}</DialogTitle>
              <DialogDescription>{t('reviewIntro')}</DialogDescription>
            </DialogHeader>

            <div className="my-2 divide-y divide-gray-100 rounded-lg border border-gray-100 text-sm">
              <ReviewRow
                label={t('editDateLabel')}
                changed={pendingChanges.date}
                before={longDate(booking.date)}
                after={longDate(dateString)}
              />
              <ReviewRow
                label={t('editTimeLabel')}
                changed={pendingChanges.startTime || pendingChanges.duration}
                before={slotRange(booking.startTime, booking.duration)}
                after={slotRange(startTime, duration)}
              />
              <ReviewRow
                label={t('editPeopleLabel')}
                changed={pendingChanges.people}
                before={String(booking.numberOfPeople || 1)}
                after={String(people)}
              />
              {/* The short type name, like every other row. The explanatory
                  sentence belongs under the pickers, not in a table cell. */}
              <ReviewRow
                label={t('bayLabel')}
                changed={false}
                before={bayType === 'ai_lab' ? t('bayTypeAiLab') : t('bayTypeSocial')}
                after=""
              />
            </div>

            {error && <ErrorNote message={error} />}

            <p className="text-xs text-gray-500">{t('rateChangeNote')}</p>

            <DialogFooter className="gap-2 sm:flex-col sm:space-y-2">
              <Button onClick={handleConfirm} disabled={isSaving} className="w-full">
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('savingChanges')}
                  </>
                ) : (
                  t('confirmChanges')
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setStage('form')}
                disabled={isSaving}
                className="w-full"
              >
                {t('backToEdit')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('editTitle')}</DialogTitle>
              <DialogDescription>{t('editIntro')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {/* Date */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <CalendarIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  {t('editDateLabel')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <DateChip
                    label={t('todayLabel')}
                    active={dateString === todayISO}
                    onClick={() => setDateString(todayISO)}
                  />
                  <DateChip
                    label={t('tomorrowLabel')}
                    active={dateString === tomorrowISO}
                    onClick={() => setDateString(tomorrowISO)}
                  />
                  <DateChip
                    label={longDate(booking.date)}
                    active={isOriginalDate}
                    onClick={() => setDateString(booking.date)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowCalendar((open) => !open)}
                  className="mt-2 flex w-full items-center justify-between rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:border-green-500"
                >
                  <span className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-green-600" aria-hidden="true" />
                    {t('pickAnotherDate')}
                  </span>
                  <span className="text-gray-500">{longDate(dateString)}</span>
                </button>

                {showCalendar && (
                  <div className="rdp-bay-booking mt-2 flex justify-center rounded-lg border border-gray-200 p-2">
                    {/* react-day-picker v9 class names, scoped to `.rdp-bay-booking`.
                        Carried here rather than relied on from DateSelection.tsx:
                        styled-jsx only injects a component's global styles while
                        that component is mounted, and the create flow's date step
                        is not on screen when this modal is. Without them, past
                        days render as if they were bookable and swallow clicks. */}
                    <style jsx global>{`
                      .rdp-bay-booking .rdp-root {
                        --rdp-accent-color: rgb(22 163 74);
                        --rdp-accent-background-color: rgb(220 252 231);
                        --rdp-today-color: rgb(22 163 74);
                        --rdp-day-width: 40px;
                        --rdp-day-height: 40px;
                        margin: 0;
                      }
                      .rdp-bay-booking .rdp-day_button:focus-visible {
                        outline: none;
                      }
                      .rdp-bay-booking .rdp-today:not(.rdp-selected) .rdp-day_button {
                        background: none;
                        color: rgb(22 163 74);
                        font-weight: 700;
                        border: 2px solid rgb(22 163 74);
                      }
                      .rdp-bay-booking .rdp-selected .rdp-day_button {
                        color: white;
                        background-color: rgb(22 163 74);
                        border-color: rgb(22 163 74);
                      }
                      .rdp-bay-booking .rdp-day:not(.rdp-disabled):not(.rdp-selected) .rdp-day_button:hover {
                        color: rgb(22 163 74);
                        background-color: rgb(220 252 231);
                      }
                      .rdp-bay-booking .rdp-disabled .rdp-day_button,
                      .rdp-bay-booking .rdp-disabled .rdp-day_button:hover {
                        color: rgb(156 163 175);
                        cursor: not-allowed;
                        background-color: rgb(243 244 246);
                      }
                      .rdp-bay-booking .rdp-disabled.rdp-today .rdp-day_button {
                        border-color: rgb(156 163 175);
                      }
                      .rdp-bay-booking .rdp-chevron {
                        fill: rgb(22 163 74);
                      }
                    `}</style>
                    <DayPicker
                      mode="single"
                      selected={calendarDate}
                      onSelect={(picked) => {
                        if (picked) {
                          // DayPicker hands back a LOCAL-midnight Date, so
                          // formatting it with local getters is the correct
                          // round trip here (unlike a Bangkok instant).
                          setDateString(formatDate(picked, 'yyyy-MM-dd'));
                          setShowCalendar(false);
                        }
                      }}
                      startMonth={calendarToday}
                      disabled={[{ before: calendarToday }]}
                    />
                  </div>
                )}
              </div>

              {/* Time */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <ClockIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  {t('editTimeLabel')}
                </p>

                {isLoadingSlots ? (
                  <p className="flex items-center gap-2 py-3 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> {t('loadingTimes')}
                  </p>
                ) : offerableSlots.length === 0 ? (
                  <p className="py-3 text-sm text-gray-500">{t('noTimesAvailable')}</p>
                ) : (
                  <div className="space-y-3">
                    {BOOKING_PERIODS.filter((period) => slotsByPeriod[period].length > 0).map(
                      (period) => (
                        <div key={period}>
                          <div className="grid grid-cols-4 gap-1.5">
                            {slotsByPeriod[period].map(({ slot }) => {
                              const isCurrent =
                                isOriginalDate && slot.startTime === booking.startTime;
                              const isSelected = slot.startTime === startTime;
                              return (
                                <button
                                  key={slot.startTime}
                                  type="button"
                                  onClick={() => setStartTime(slot.startTime)}
                                  aria-pressed={isSelected}
                                  className={`flex h-10 items-center justify-center rounded-lg text-sm tabular-nums transition-colors ${
                                    isSelected
                                      ? 'bg-green-600 font-semibold text-white'
                                      : isCurrent
                                        ? 'border-2 border-dashed border-green-600 text-green-700'
                                        : 'border border-gray-300 text-gray-700 hover:border-green-500'
                                  }`}
                                >
                                  {slot.startTime}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )
                    )}
                    {isOriginalDate && (
                      <p className="text-xs text-gray-500">{t('currentSlotLabel')}</p>
                    )}
                  </div>
                )}
              </div>

              <SegmentedOptions
                label={t('editDurationLabel')}
                icon={ClockIcon}
                options={durationOptions}
                value={duration}
                onChange={setDuration}
                formatOption={formatDurationLabel}
              />

              <SegmentedOptions
                label={t('editPeopleLabel')}
                icon={UsersIcon}
                options={Array.from({ length: MAX_PEOPLE - MIN_PEOPLE + 1 }, (_, i) => MIN_PEOPLE + i)}
                value={people}
                onChange={setPeople}
              />

              <div>
                <label
                  htmlFor="vip-edit-notes"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  {t('editNotesLabel')}
                </label>
                <textarea
                  id="vip-edit-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, MAX_CUSTOMER_NOTES_LENGTH))}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>

              <p className="text-xs text-gray-500">
                {bayType === 'ai_lab' ? t('bayNoteAiLab') : t('bayNoteSocial')}
              </p>
            </div>

            {error && <ErrorNote message={error} />}

            <DialogFooter className="gap-2 sm:flex-col sm:space-y-2">
              <Button
                onClick={() => {
                  setError(null);
                  setStage('review');
                }}
                disabled={!hasChanges}
                className="w-full"
              >
                {t('reviewChanges')}
              </Button>
              <Button variant="outline" onClick={resetAndClose} className="w-full">
                {t('keepBooking')}
              </Button>
            </DialogFooter>
            {!hasChanges && (
              <p className="text-center text-xs text-gray-500">{t('noChangesYet')}</p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

function DateChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-10 items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors ${
        active
          ? 'bg-green-600 text-white'
          : 'border border-gray-300 text-gray-700 hover:border-green-500'
      }`}
    >
      {label}
    </button>
  );
}

/**
 * The old value, an arrow, the new value.
 *
 * Deliberately NOT struck through. A line through `09:00 - 11:00` runs straight
 * across the separating hyphen, so the range reads as one mangled number and the
 * customer has to squint at the thing whose entire job is to be scannable. The
 * arrow already says "became", and muted-vs-bold carries the rest; `sr-only`
 * text says it out loud for anyone who cannot see either.
 *
 * Wraps rather than overflowing: two time ranges plus an arrow do not fit beside
 * a label on a 375px screen.
 */
function FromTo({ from, to }: { from: string; to: string }) {
  return (
    <span className="flex flex-wrap items-center justify-end gap-x-1.5 text-right">
      <span className="text-gray-400">{from}</span>
      <ArrowRight className="h-3 w-3 flex-shrink-0 text-gray-400" aria-hidden="true" />
      <span className="sr-only">changed to</span>
      <span className="font-semibold text-green-700">{to}</span>
    </span>
  );
}

/** One line of the review table. Unchanged fields still show, so the customer
 *  can confirm what is NOT moving as well as what is. */
function ReviewRow({
  label,
  changed,
  before,
  after,
}: {
  label: string;
  changed: boolean;
  before: string;
  after: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 px-3 py-2.5 ${changed ? 'bg-green-50' : ''}`}>
      <span className="flex-shrink-0 text-gray-500">{label}</span>
      {changed ? (
        <FromTo from={before} to={after} />
      ) : (
        <span className="text-right font-medium text-gray-900">{before}</span>
      )}
    </div>
  );
}

function ChangeRow({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex-shrink-0 text-gray-500">{label}</span>
      <FromTo from={from} to={to} />
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className="my-2 flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
      <AlertTriangle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

export default BookingModifyModal;
