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
