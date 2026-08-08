'use client';

/**
 * Funnel telemetry shared by the bay-booking and course-rental flows.
 *
 * Both flows emit the same payload — step / step_index / total_steps — so the
 * two funnels stay comparable in GA4 without a second set of custom dimensions
 * (`step` and `step_index` were registered on 2026-06-21, and because a GA4
 * custom dimension is keyed on the PARAMETER name rather than the event, the
 * same two cover both flows).
 *
 * Route every step-viewed push through `useStepViewedTelemetry`. It owns the
 * payload shape AND the dedupe policy, so a new flow cannot pick up one without
 * the other — previously the two were kept in sync by a comment, which is not a
 * mechanism.
 *
 * SEMANTICS: one event per step per mount — a *first view*, not a step entry.
 * Re-entering a step (back-navigation, or the step header's "Change" pill,
 * which makes going back an advertised path rather than a rare accident) does
 * not re-emit, so per-step event counts are usable directly as drop-off
 * denominators. A course_rental_step_viewed count spanning this change will
 * step down, and needs an annotation rather than a trend reading; bay booking
 * has no series to break, because its events reached GA4 for the first time on
 * 2026-08-04 (the dataLayer push shipped 2026-07-25 but no GTM trigger existed
 * until then, so nothing was ever forwarded).
 *
 * A remount is a new first view by design: switching language navigates to a
 * different `[locale]` route, and the restored step is genuinely viewed again.
 */
import { useEffect, useRef } from 'react';
import { pushEventToGtm } from '@/utils/gtm';

/** The three-step spine, in order. `currentStep` in useBookingFlow is 1-based. */
export const BAY_BOOKING_STEPS = ['date', 'time', 'details'] as const;

export type BayBookingStep = (typeof BAY_BOOKING_STEPS)[number];

export interface StepViewedOptions {
  /** GTM event name, e.g. 'bay_booking_step_viewed'. */
  event: string;
  /**
   * Every reportable step, in funnel order. Must be a stable reference — a
   * module-level constant, not an inline literal — because it is an effect
   * dependency.
   */
  steps: readonly string[];
  /** Zero-based position in `steps`. Out-of-range values are ignored. */
  index: number;
  /**
   * Value for the `total_steps` dimension; defaults to `steps.length`. Pass it
   * explicitly when `steps` ends with a terminal step that sits outside the
   * funnel proper (course-rental's 'confirmation') so the denominator keeps
   * counting only the steps a customer actually walks through.
   */
  totalSteps?: number;
}

/**
 * Push one step-viewed event. Does NOT dedupe — call `useStepViewedTelemetry`
 * from a flow instead. Exported for direct unit testing of the payload shape.
 */
export function pushStepViewed({ event, steps, index, totalSteps }: StepViewedOptions): void {
  // An out-of-range index means the caller's step state and its step list have
  // diverged. Drop it rather than emit `step: undefined`, which would land in
  // GA4 as a real row and quietly corrupt the funnel.
  if (index < 0 || index >= steps.length) return;

  pushEventToGtm(event, {
    step: steps[index],
    step_index: index,
    total_steps: totalSteps ?? steps.length,
  });
}

/**
 * Report the first view of each step, at most once per mount.
 *
 * `enabled` defers reporting while the flow's initial step is still settling —
 * a `useFlowPersistence` restore, or a deep link that promotes the step in a
 * later effect. Steps passed over while disabled are NOT backfilled: the
 * customer never saw them, so they must not appear in the funnel.
 */
export function useStepViewedTelemetry({
  event,
  steps,
  index,
  totalSteps,
  enabled = true,
}: StepViewedOptions & { enabled?: boolean }): void {
  const seen = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    if (index < 0 || index >= steps.length) return;
    if (seen.current.has(index)) return;

    seen.current.add(index);
    pushStepViewed({ event, steps, index, totalSteps });
  }, [enabled, event, steps, index, totalSteps]);
}

/** Where a sign-in was offered. Distinguishes the surfaces in the funnel. */
export type AuthSurface = 'login_page' | 'booking_details' | 'confirmation_upsell';

/**
 * A customer chose a sign-in provider.
 *
 * A real dataLayer event rather than something GTM scrapes off the button.
 * The existing triggers for this match CLICK TEXT — "Continue with Google" and
 * friends — which makes them silently dependent on two things they should not
 * be: the exact copy, and the language it is rendered in. The in-flow row
 * labels its buttons with the brand alone, so those triggers would simply stop
 * counting it, and no Thai or Japanese click has ever matched them at all.
 *
 * `surface` is what click-text can never tell you anyway: the same three
 * providers now appear on the login page, inside the booking form, and on the
 * confirmation upsell, and the whole point of the funnel work is knowing which
 * of them converts.
 */
export function pushAuthProviderChosen(provider: string, surface: AuthSurface): void {
  pushEventToGtm('auth_provider_chosen', { provider, surface });
}

/**
 * A customer picked a date, leaving step 1.
 *
 * Replaces GTM trigger #68, which matched Click Text containing "Select" on a
 * path containing `/bookings` — so it only ever saw the English "Select Date"
 * card. `messages/{th,ja,ko,zh}.json` render 'เลือกวันที่', '日付を選択',
 * '날짜 선택' and '选择日期', none of which contain that substring. Measured over
 * the 90 days to 2026-08-07: `/bookings` (the unprefixed English route) fired
 * 292 times against 4 on `/ja/bookings` and 2 on `/th/bookings` — the same page,
 * the same button, separated only by the locale prefix.
 *
 * Fires from `handleDateSelect`, the one place a customer's date choice enters
 * flow state. Deliberately NOT fired for the `?selectDate=` deep link, which
 * sets the date without anyone picking anything — counting it would inflate the
 * step-1 exit rate with arrivals that skipped step 1 altogether.
 *
 * NO PAYLOAD, and specifically no `days_ahead`. It is tempting, but the `Date`
 * arriving here is not one thing: the Today/Tomorrow cards pass a real instant
 * while `DayPicker` passes midnight in the VIEWER's zone. The flow resolves that
 * consistently by reading the viewer's local calendar date
 * (`format(selectedDate, 'yyyy-MM-dd')` throughout), so a lead time computed in
 * Bangkok terms via `getBangkokDateString` would disagree with the date the
 * booking is actually made for — off by one for every customer east of +07.
 * Tag #73 continues to attach `profile_id` / `stable_hash_id` from their own
 * dataLayer variables, so nothing is lost by keeping this event bare.
 */
export function pushDateSelected(): void {
  pushEventToGtm('bay_booking_date_selected');
}

/** Which flow produced the booking. Both post to `/api/bookings/create`. */
export type BookingSurface = 'web' | 'liff';

export interface BookingConfirmedOptions {
  bookingId: string;
  surface: BookingSurface;
  /**
   * UI locale at confirmation time. The web flow can emit any of
   * 'en' | 'th' | 'ja' | 'ko' | 'zh'; LIFF has no Korean catalog
   * (`lib/liff/translations.ts` declares 'en' | 'th' | 'ja' | 'zh'), so
   * `surface: 'liff'` never carries 'ko'. Worth knowing before building a GA4
   * dimension on this and reading missing Korean LIFF rows as a data loss.
   */
  locale: string;
  email?: string | null;
  phoneNumber?: string | null;
  isNewCustomer?: boolean;
}

/**
 * A booking was actually created.
 *
 * The same class of bug as `pushAuthProviderChosen`, and a far more expensive
 * one. GTM trigger #61 fires on CLICK TEXT containing "Confirm Booking", so it
 * has only ever matched the English UI: `messages/{th,ja,ko,zh}.json` render
 * 'ยืนยันการจอง', '予約を確定', '예약 확정' and '确认预约', none of which contain
 * that substring. Three tags hang off that trigger — GA4 `booking_confirmed`
 * (#74), the Google Ads conversion (#62) and the Meta Pixel
 * `CompleteRegistration` (#15) — so every non-English booking has been invisible
 * to all three at once.
 *
 * Measured over the 90 days to 2026-08-07: 727 English bookings produced 280
 * GA4 `booking_confirmed` sessions (38%), while 141 Japanese produced 3, 46 Thai
 * produced 1, and 14 Chinese and 2 Korean produced none. Thai sessions reached
 * `bay_booking_step_viewed` 406 times against English's 148 — they get FURTHER
 * into the funnel, and were then dropped at the last step by a string match.
 * The downstream damage is not just reporting: Google Ads Smart Bidding has been
 * training on a conversion feed that omits ~all non-English customers.
 *
 * Fires AFTER `/api/bookings/create` returns ok, which also fixes a second
 * defect in the click trigger: a click that then failed still counted as a
 * conversion. This event means a booking row exists.
 *
 * `enhanced_conversions` mirrors the `course_rental_confirmed` payload so one
 * GTM user-data variable can serve both. Tag #62 currently has enhanced
 * conversions disabled and a hardcoded value of 1200 THB (see its notes — that
 * number is deliberate and per-BOOKING); nothing here overrides it.
 */
export function pushBookingConfirmed({
  bookingId,
  surface,
  locale,
  email,
  phoneNumber,
  isNewCustomer,
}: BookingConfirmedOptions): void {
  pushEventToGtm('booking_confirmed', {
    booking_id: bookingId,
    booking_surface: surface,
    booking_locale: locale,
    currency: 'THB',
    is_new_customer: isNewCustomer ?? undefined,
    enhanced_conversions: {
      email: email?.toLowerCase().trim() || undefined,
      phone_number: phoneNumber || undefined,
    },
  });
}
