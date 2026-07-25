/**
 * Bay-booking funnel telemetry as wired into useBookingFlow.
 *
 * Asserts on window.dataLayer rather than mocking @/lib/booking-telemetry: the
 * dedupe policy lives inside that module, so mocking it out would leave the
 * behaviour these tests exist to protect completely unexercised.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { useBookingFlow } from '@/app/[locale]/(features)/bookings/hooks/useBookingFlow';

let mockStatus = 'unauthenticated';
let mockSearchParams: Record<string, string> = {};

const mockReplace = jest.fn((url: string) => {
  // The real router.replace('/bookings') drops the deep-link params from the
  // URL, which is what re-opens the telemetry gate. Model that.
  if (!url.includes('?')) mockSearchParams = {};
});

jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: mockStatus }),
  signIn: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, prefetch: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => mockSearchParams[key] ?? null }),
}));

const emittedSteps = () =>
  window.dataLayer
    .filter((e) => e.event === 'bay_booking_step_viewed')
    .map((e) => e.step);

describe('useBookingFlow telemetry', () => {
  beforeEach(() => {
    window.dataLayer = [];
    mockStatus = 'unauthenticated';
    mockSearchParams = {};
    mockReplace.mockClear();
    sessionStorage.clear();
  });

  const saveSnapshot = (currentStep: number) =>
    sessionStorage.setItem(
      'lengolf.bayBookingFlow',
      JSON.stringify({
        currentStep,
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

  test('reports only the restored step (details), not a phantom date step', async () => {
    saveSnapshot(3);

    const { result } = renderHook(() => useBookingFlow());

    await waitFor(() => expect(result.current.currentStep).toBe(3));

    expect(emittedSteps()).toEqual(['details']);
  });

  // Guards the opposite failure to the one above. If the `flowRestored` gate is
  // ever tightened to a flag that never flips — or the effect is reordered so it
  // becomes unreachable — telemetry goes silent for every first-time visitor,
  // the largest population in the funnel, while the restore test above stays
  // green. Nobody files a bug about events that never arrive, so it needs a test.
  test('a fresh mount with no saved snapshot still reports step 1', async () => {
    renderHook(() => useBookingFlow());

    await waitFor(() => expect(emittedSteps()).toEqual(['date']));
  });

  test('back-navigation does not re-report a step already viewed', async () => {
    mockStatus = 'authenticated';

    const { result } = renderHook(() => useBookingFlow());
    await waitFor(() => expect(emittedSteps()).toEqual(['date']));

    // 1 -> 2 -> 3 -> back to 2 -> forward to 3 again.
    act(() => result.current.handleDateSelect(new Date('2026-08-01T00:00:00.000Z')));
    act(() => result.current.handleTimeSelect('10:00', 1));
    act(() => result.current.handleBack());
    act(() => result.current.handleTimeSelect('11:00', 1));

    await waitFor(() => expect(result.current.currentStep).toBe(3));

    expect(emittedSteps()).toEqual(['date', 'time', 'details']);
  });

  // The signed-out deep-link round trip. handleDateSelect sends an unauthenticated
  // customer to sign-in with ?selectDate=..., having already reported a genuine
  // `date` view. On the return load the session resolves before the deep-link
  // effect promotes the flow to step 2, so an ungated effect reports `date` a
  // second time — roughly doubling step 1 for every signed-out customer.
  test('an auth-return deep link reports the landed step only, not step 1 again', async () => {
    mockStatus = 'loading';
    mockSearchParams = { selectDate: '2026-08-01T00:00:00.000Z' };

    const { result, rerender } = renderHook(() => useBookingFlow());

    // Session still resolving: nothing reported yet.
    await waitFor(() => expect(result.current.currentStep).toBe(1));
    expect(emittedSteps()).toEqual([]);

    mockStatus = 'authenticated';
    act(() => rerender());

    await waitFor(() => expect(result.current.currentStep).toBe(2));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/bookings', { scroll: false }));

    expect(emittedSteps()).toEqual(['time']);
  });

  test('a deep link that never resolves still reports once the session is known', async () => {
    // status settles to 'unauthenticated', so the deep-link effect never runs and
    // never clears the param. The gate must open anyway or the funnel goes silent.
    mockStatus = 'unauthenticated';
    mockSearchParams = { selectDate: '2026-08-01T00:00:00.000Z' };

    renderHook(() => useBookingFlow());

    await waitFor(() => expect(emittedSteps()).toEqual(['date']));
  });
});
