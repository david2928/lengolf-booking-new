/**
 * Bay-booking funnel telemetry. Mirrors the course-rental events
 * (course_rental_step_viewed) so both flows can be compared in GA4.
 */
import { BAY_BOOKING_STEPS, pushBayBookingStepViewed } from '@/lib/booking-telemetry';

describe('BAY_BOOKING_STEPS', () => {
  test('is the three-step spine in order', () => {
    expect(BAY_BOOKING_STEPS).toEqual(['date', 'time', 'details']);
  });
});

describe('pushBayBookingStepViewed', () => {
  beforeEach(() => {
    window.dataLayer = [];
  });

  test('pushes step name, zero-based index and total', () => {
    pushBayBookingStepViewed(2);

    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer[0]).toEqual({
      event: 'bay_booking_step_viewed',
      step: 'time',
      step_index: 1,
      total_steps: 3,
    });
  });

  test('maps step 1 to date and step 3 to details', () => {
    pushBayBookingStepViewed(1);
    pushBayBookingStepViewed(3);

    expect(window.dataLayer[0].step).toBe('date');
    expect(window.dataLayer[0].step_index).toBe(0);
    expect(window.dataLayer[1].step).toBe('details');
    expect(window.dataLayer[1].step_index).toBe(2);
  });

  test('ignores an out-of-range step rather than pushing a bad event', () => {
    pushBayBookingStepViewed(0);
    pushBayBookingStepViewed(4);

    expect(window.dataLayer).toHaveLength(0);
  });
});
