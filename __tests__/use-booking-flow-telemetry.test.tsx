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

const steps = () =>
  (window.dataLayer ?? [])
    .filter((d) => d.event === 'bay_booking_step_viewed')
    .map((d) => d.step);

describe('useBookingFlow telemetry', () => {
  beforeEach(() => {
    window.dataLayer = [];
    sessionStorage.clear();
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
  });
});
