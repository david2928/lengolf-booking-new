/**
 * Bay-booking funnel telemetry.
 *
 * Deliberately mirrors the course-rental event shape in
 * app/[locale]/course-rental/page.tsx (course_rental_step_viewed with
 * step / step_index / total_steps) so the two funnels are comparable in
 * GA4 without a second set of custom dimensions. The `step` and
 * `step_index` dimensions were registered on 2026-06-21.
 */
import { pushEventToGtm } from '@/utils/gtm';

/** The three-step spine, in order. `currentStep` in useBookingFlow is 1-based. */
export const BAY_BOOKING_STEPS = ['date', 'time', 'details'] as const;

export type BayBookingStep = (typeof BAY_BOOKING_STEPS)[number];

/**
 * Fire a step-viewed event. `currentStep` is the 1-based step number used by
 * useBookingFlow; out-of-range values are ignored so a bad state cannot emit a
 * junk event that pollutes the funnel.
 */
export function pushBayBookingStepViewed(currentStep: number): void {
  const index = currentStep - 1;
  const step = BAY_BOOKING_STEPS[index];
  if (!step) return;

  pushEventToGtm('bay_booking_step_viewed', {
    step,
    step_index: index,
    total_steps: BAY_BOOKING_STEPS.length,
  });
}
