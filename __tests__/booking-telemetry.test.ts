/**
 * Step-viewed funnel telemetry shared by the bay-booking and course-rental
 * flows. Both emit the same payload so they can be compared in GA4, and both
 * dedupe to first-view-per-mount so per-step counts work as drop-off
 * denominators.
 */
import { renderHook } from '@testing-library/react';
import {
  BAY_BOOKING_STEPS,
  pushStepViewed,
  useStepViewedTelemetry,
} from '@/lib/booking-telemetry';

// Mirrors course-rental's TELEMETRY_STEPS: the funnel proper plus a terminal
// step that is reported but excluded from the denominator.
const COURSE_STEPS = ['dates', 'set', 'delivery', 'contact', 'review', 'confirmation'] as const;
const COURSE_TOTAL = 5;

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
    pushStepViewed({ event: 'bay_booking_step_viewed', steps: BAY_BOOKING_STEPS, index: 1 });

    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer[0]).toEqual({
      event: 'bay_booking_step_viewed',
      step: 'time',
      step_index: 1,
      total_steps: 3,
    });
  });

  test('keeps total_steps at the funnel length when a terminal step is reported', () => {
    // The course-rental wire shape collected since mid-May: 'confirmation'
    // reports step_index 5 while total_steps stays 5. Changing either would
    // break the existing series as surely as renaming a step.
    pushStepViewed({
      event: 'course_rental_step_viewed',
      steps: COURSE_STEPS,
      index: COURSE_STEPS.indexOf('confirmation'),
      totalSteps: COURSE_TOTAL,
    });

    expect(window.dataLayer[0]).toEqual({
      event: 'course_rental_step_viewed',
      step: 'confirmation',
      step_index: 5,
      total_steps: 5,
    });
  });

  test('ignores an out-of-range index rather than pushing step: undefined', () => {
    pushStepViewed({ event: 'bay_booking_step_viewed', steps: BAY_BOOKING_STEPS, index: -1 });
    pushStepViewed({ event: 'bay_booking_step_viewed', steps: BAY_BOOKING_STEPS, index: 3 });

    expect(window.dataLayer).toHaveLength(0);
  });

  test('creates the dataLayer when the first event beats the GTM snippet', () => {
    delete (window as unknown as { dataLayer?: unknown[] }).dataLayer;

    pushStepViewed({ event: 'bay_booking_step_viewed', steps: BAY_BOOKING_STEPS, index: 0 });

    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer[0].step).toBe('date');
  });
});

describe('useStepViewedTelemetry', () => {
  beforeEach(() => {
    window.dataLayer = [];
  });

  const emitted = () => window.dataLayer.map((e) => e.step);

  const renderFlow = (index: number, enabled = true) =>
    renderHook(
      ({ index: i, enabled: e }) =>
        useStepViewedTelemetry({
          event: 'bay_booking_step_viewed',
          steps: BAY_BOOKING_STEPS,
          index: i,
          enabled: e,
        }),
      { initialProps: { index, enabled } },
    );

  test('reports the step on first view', () => {
    renderFlow(0);

    expect(emitted()).toEqual(['date']);
  });

  test('does not re-report a step re-entered by back-navigation', () => {
    // The 1->2->3->2->3 path. Under step-entry semantics this emitted `time`
    // and `details` twice, inflating any event-count drop-off report.
    const { rerender } = renderFlow(0);
    rerender({ index: 1, enabled: true });
    rerender({ index: 2, enabled: true });
    rerender({ index: 1, enabled: true });
    rerender({ index: 2, enabled: true });

    expect(emitted()).toEqual(['date', 'time', 'details']);
  });

  test('re-rendering on the same step does not re-report', () => {
    const { rerender } = renderFlow(1);
    rerender({ index: 1, enabled: true });

    expect(emitted()).toEqual(['time']);
  });

  test('reports nothing while disabled', () => {
    renderFlow(0, false);

    expect(emitted()).toEqual([]);
  });

  test('does not backfill steps passed over while disabled', () => {
    // The auth-return case: the flow renders step 1 with telemetry suppressed,
    // then the deep-link effect promotes it to step 2. Step 1 was already
    // reported before sign-in, so emitting it again would double-count it.
    const { rerender } = renderFlow(0, false);
    rerender({ index: 1, enabled: true });

    expect(emitted()).toEqual(['time']);
  });

  test('a fresh mount starts a new set of first views', () => {
    // A language switch remounts the page under a different [locale] route.
    // The restored step is genuinely viewed again, so it should report again.
    renderFlow(2).unmount();
    renderFlow(2);

    expect(emitted()).toEqual(['details', 'details']);
  });
});
