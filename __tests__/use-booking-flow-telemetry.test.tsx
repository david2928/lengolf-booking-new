/**
 * Regression test for the bay-booking funnel telemetry restore bug: without
 * gating on `useFlowPersistence`'s `restored` flag, a mount that restores to
 * step 3 fires a phantom `date` event for the initial step-1 render before the
 * restored step lands, and the middle step (`time`) is never reported at all.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { useBookingFlow } from '@/app/[locale]/(features)/bookings/hooks/useBookingFlow';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'unauthenticated' }),
  signIn: jest.fn(),
}));

jest.mock('@/lib/booking-telemetry', () => ({
  pushBayBookingStepViewed: jest.fn(),
}));

import { pushBayBookingStepViewed } from '@/lib/booking-telemetry';

const mockedPush = pushBayBookingStepViewed as jest.Mock;

describe('useBookingFlow telemetry on restore', () => {
  beforeEach(() => {
    mockedPush.mockClear();
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

    const emittedSteps = mockedPush.mock.calls.map((call) => call[0]);
    expect(emittedSteps).toEqual([3]);
  });

  // Guards the opposite failure to the one above. If the `flowRestored` gate is
  // ever tightened to a flag that never flips — or the effect is reordered so it
  // becomes unreachable — telemetry goes silent for every first-time visitor,
  // the largest population in the funnel, while the restore test above stays
  // green. Nobody files a bug about events that never arrive, so it needs a test.
  test('a fresh mount with no saved snapshot still reports step 1', async () => {
    renderHook(() => useBookingFlow());

    await waitFor(() => expect(mockedPush).toHaveBeenCalled());

    expect(mockedPush.mock.calls.map((call) => call[0])).toEqual([1]);
  });
});
