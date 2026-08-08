/**
 * Bay-booking funnel telemetry as wired into useBookingFlow.
 *
 * Asserts against `window.dataLayer` rather than a mock of the telemetry module,
 * because the module IS the thing under test here: the hook owns the dedupe
 * policy, and a mock would let a regression in it pass silently.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { useBookingFlow } from '@/app/[locale]/(features)/bookings/hooks/useBookingFlow';

/**
 * Overrides the blanket `next/navigation` mock in `jest.setup.js`, whose
 * `useSearchParams().get` returns undefined for everything. The deep-link test
 * below needs to actually supply `?selectDate=`, and that is the whole point of
 * it — the invariant being guarded is that the deep link stays SILENT, which a
 * mock that can never produce a param would assert vacuously.
 */
const mockSearchParams: Record<string, string | null> = {};

/**
 * Both objects are created ONCE and reused, which is load-bearing rather than
 * tidiness. `useBookingFlow`'s deep-link effect lists `searchParams` and
 * `router` in its dependency array, and its `finally` block sets state — so a
 * mock that returned a fresh object per render would re-run the effect on every
 * render and spin forever. Real `useSearchParams`/`useRouter` return stable
 * references, so a per-render object would also be testing something Next never
 * does. (The blanket mock in `jest.setup.js` does return fresh objects; it gets
 * away with it only because its `get` always yields undefined, so the effect
 * body never sets state and never re-renders.)
 */
const mockRouter = { push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() };
const mockSearchParamsApi = { get: (key: string) => mockSearchParams[key] ?? null };

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParamsApi,
}));

const steps = () =>
  (window.dataLayer ?? [])
    .filter((d) => d.event === 'bay_booking_step_viewed')
    .map((d) => d.step);

const dateSelects = () =>
  (window.dataLayer ?? []).filter((d) => d.event === 'bay_booking_date_selected').length;

describe('useBookingFlow telemetry', () => {
  beforeEach(() => {
    window.dataLayer = [];
    sessionStorage.clear();
    for (const key of Object.keys(mockSearchParams)) delete mockSearchParams[key];
  });

  test('reports only the restored step (details), not a phantom date step', async () => {
    sessionStorage.setItem(
      'lengolf.bayBookingFlow',
      JSON.stringify({
        currentStep: 3,
        selectedDateIso: new Date('2026-08-01T00:00:00.000Z').toISOString(),
        selectedTime: '10:00',
        selectedBayType: null,
        maxDuration: 1,
        selectedPackageId: null,
        selectedClubRental: 'standard',
        selectedClubSetId: null,
        selectedAddOns: {},
        selectedSlotData: null,
      }),
    );

    const { result } = renderHook(() => useBookingFlow());

    await waitFor(() => expect(result.current.currentStep).toBe(3));
    await waitFor(() => expect(steps()).toEqual(['details']));
  });

  // Guards the opposite failure to the one above. If the `flowRestored` gate is
  // ever tightened to a flag that never flips — or the effect is reordered so it
  // becomes unreachable — telemetry goes silent for every first-time visitor,
  // the largest population in the funnel, while the restore test above stays
  // green. Nobody files a bug about events that never arrive, so it needs a test.
  test('a fresh mount with no saved snapshot still reports step 1', async () => {
    renderHook(() => useBookingFlow());

    await waitFor(() => expect(steps()).toEqual(['date']));
  });

  // The regression this file exists for. Going back is an advertised path now —
  // the step header carries a "Change" pill — so a 1->2->1->2 journey is normal,
  // and it used to report `date` and `time` twice each. Any event-count drop-off
  // report built on that reads the later steps as larger than they were.
  test('does not re-report a step the customer returns to', async () => {
    const { result } = renderHook(() => useBookingFlow());

    await waitFor(() => expect(steps()).toEqual(['date']));

    act(() => result.current.handleDateSelect(new Date('2026-08-05T00:00:00.000Z')));
    await waitFor(() => expect(result.current.currentStep).toBe(2));

    act(() => result.current.handleBack());
    await waitFor(() => expect(result.current.currentStep).toBe(1));

    act(() => result.current.handleDateSelect(new Date('2026-08-05T00:00:00.000Z')));
    await waitFor(() => expect(result.current.currentStep).toBe(2));

    expect(steps()).toEqual(['date', 'time']);
    // Same dedupe rule for the date pick, for the same reason: this event feeds
    // GTM tag #73 (GA4 `booking_page_date`, funnel stage 3), and a re-pick that
    // re-reported would let stage 3 out-count the step it descends from.
    expect(dateSelects()).toBe(1);
  });

  // `bay_booking_date_selected` replaces GTM trigger #68, which matched the
  // English word "Select" in Click Text. Nothing here would fail loudly if the
  // push were dropped — a missing dataLayer event is silent end to end — so the
  // positive case needs a test as much as the dedupe does.
  test('reports one date pick when the customer chooses a date', async () => {
    const { result } = renderHook(() => useBookingFlow());

    await waitFor(() => expect(steps()).toEqual(['date']));
    expect(dateSelects()).toBe(0);

    act(() => result.current.handleDateSelect(new Date('2026-08-05T00:00:00.000Z')));

    await waitFor(() => expect(result.current.currentStep).toBe(2));
    expect(dateSelects()).toBe(1);
  });

  // The invariant that was previously asserted only by a comment. A marketing
  // deep link sets the date and promotes the step directly, without anyone
  // picking anything; reporting it would credit step 1 with arrivals that
  // skipped step 1 entirely. The effect that consumes `?selectDate=` sets the
  // very same two pieces of state as `handleDateSelect`, so this is one
  // plausible edit away from breaking.
  test('the ?selectDate= deep link reports no date pick', async () => {
    mockSearchParams.selectDate = '2026-08-05';

    const { result } = renderHook(() => useBookingFlow());

    await waitFor(() => expect(result.current.currentStep).toBe(2));
    expect(dateSelects()).toBe(0);
  });
});
