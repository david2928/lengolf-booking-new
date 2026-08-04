/**
 * Funnel telemetry shared by the bay-booking and course-rental flows. Both emit
 * the same payload (course_rental_step_viewed / bay_booking_step_viewed) so the
 * two funnels can be compared in GA4.
 */
import { renderHook } from '@testing-library/react';
import {
  BAY_BOOKING_STEPS,
  pushStepViewed,
  useStepViewedTelemetry,
} from '@/lib/booking-telemetry';

const BAY = 'bay_booking_step_viewed';

describe('BAY_BOOKING_STEPS', () => {
  test('is the three-step spine in order', () => {
    // Locks the GA4 `step` dimension values: renaming one silently breaks every
    // saved funnel exploration, so a rename must be a deliberate edit here.
    expect(BAY_BOOKING_STEPS).toEqual(['date', 'time', 'details']);
  });
});

describe('pushStepViewed', () => {
  beforeEach(() => {
    window.dataLayer = [];
  });

  test('pushes step name, zero-based index and total', () => {
    pushStepViewed({ event: BAY, steps: BAY_BOOKING_STEPS, index: 1 });

    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer[0]).toEqual({
      event: BAY,
      step: 'time',
      step_index: 1,
      total_steps: 3,
    });
  });

  test('maps index 0 to date and index 2 to details', () => {
    pushStepViewed({ event: BAY, steps: BAY_BOOKING_STEPS, index: 0 });
    pushStepViewed({ event: BAY, steps: BAY_BOOKING_STEPS, index: 2 });

    expect(window.dataLayer[0].step).toBe('date');
    expect(window.dataLayer[0].step_index).toBe(0);
    expect(window.dataLayer[1].step).toBe('details');
    expect(window.dataLayer[1].step_index).toBe(2);
  });

  test('ignores an out-of-range index rather than pushing a bad event', () => {
    pushStepViewed({ event: BAY, steps: BAY_BOOKING_STEPS, index: -1 });
    pushStepViewed({ event: BAY, steps: BAY_BOOKING_STEPS, index: 3 });

    expect(window.dataLayer).toHaveLength(0);
  });

  test('creates the dataLayer when the first event beats the GTM snippet', () => {
    delete (window as unknown as { dataLayer?: unknown[] }).dataLayer;

    pushStepViewed({ event: BAY, steps: BAY_BOOKING_STEPS, index: 0 });

    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer[0].step).toBe('date');
  });

  // Course-rental's 'confirmation' is a real step view that sits outside the
  // funnel denominator. Without the override the total would silently tick from
  // 5 to 6 and every historical drop-off rate would be computed against a
  // different base than the one collected since mid-May.
  test('honours an explicit totalSteps for a terminal step outside the funnel', () => {
    const steps = ['dates', 'set', 'delivery', 'contact', 'review', 'confirmation'] as const;

    pushStepViewed({
      event: 'course_rental_step_viewed',
      steps,
      index: 5,
      totalSteps: 5,
    });

    expect(window.dataLayer[0]).toEqual({
      event: 'course_rental_step_viewed',
      step: 'confirmation',
      step_index: 5,
      total_steps: 5,
    });
  });
});

describe('useStepViewedTelemetry', () => {
  beforeEach(() => {
    window.dataLayer = [];
  });

  const render = (index: number, enabled = true) =>
    renderHook(
      ({ i, e }: { i: number; e: boolean }) =>
        useStepViewedTelemetry({ event: BAY, steps: BAY_BOOKING_STEPS, index: i, enabled: e }),
      { initialProps: { i: index, e: enabled } },
    );

  test('reports a step the first time it is viewed', () => {
    render(0);

    expect(window.dataLayer.map((d) => d.step)).toEqual(['date']);
  });

  // The bug this hook exists for. The step header's "Change" pill makes going
  // back an advertised path, so 1->2->3->2->3 is a normal journey, not a corner
  // case — and it used to emit `time` and `details` twice each, inflating every
  // later step in any event-count drop-off report.
  test('does not re-report a step re-entered by going back', () => {
    const { rerender } = render(0);

    rerender({ i: 1, e: true });
    rerender({ i: 2, e: true });
    rerender({ i: 1, e: true });
    rerender({ i: 2, e: true });

    expect(window.dataLayer.map((d) => d.step)).toEqual(['date', 'time', 'details']);
  });

  test('reports nothing while disabled, and does not backfill on enable', () => {
    const { rerender } = renderHook(
      ({ i, e }: { i: number; e: boolean }) =>
        useStepViewedTelemetry({ event: BAY, steps: BAY_BOOKING_STEPS, index: i, enabled: e }),
      { initialProps: { i: 0, e: false } },
    );

    expect(window.dataLayer).toHaveLength(0);

    // The flow settles on step 3 (a restore, or a deep link promoting the step).
    // Steps 1 and 2 were never on screen, so they must not appear in the funnel.
    rerender({ i: 2, e: true });

    expect(window.dataLayer.map((d) => d.step)).toEqual(['details']);
  });

  test('ignores an out-of-range index', () => {
    render(5);

    expect(window.dataLayer).toHaveLength(0);
  });

  // A remount is a new first view by design: switching language navigates to a
  // different /[locale] route and the restored step is genuinely viewed again.
  test('reports again after a remount', () => {
    render(0).unmount();
    render(0);

    expect(window.dataLayer.map((d) => d.step)).toEqual(['date', 'date']);
  });
});
