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
  if (index < 0 || index >= BAY_BOOKING_STEPS.length) return;
  const step = BAY_BOOKING_STEPS[index];

  pushEventToGtm('bay_booking_step_viewed', {
    step,
    step_index: index,
    total_steps: BAY_BOOKING_STEPS.length,
  });
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
