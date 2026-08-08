/**
 * The bay type is chosen ONCE, on step 2, and carried from there — the same
 * single `bayPreference` the LIFF flow has always had.
 *
 * Before this, step 2's control only filtered the slot list and step 3 asked
 * again with a required `Bay Type *` picker. The choice therefore has to live
 * on the flow rather than inside either step, and these tests pin the three
 * journeys where a component-local choice would have been lost:
 *
 *   - a sessionStorage restore (what a language switch does to this page),
 *   - stepping back from step 3 to the step that owns the control,
 *   - picking a time, which must not re-supply the bay as a second source.
 *
 * "All Bays" is a real answer meaning no preference, so `null` has to survive
 * all three intact and must never be repaired into a default.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBookingFlow } from '@/app/[locale]/(features)/bookings/hooks/useBookingFlow';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated' }),
  signIn: jest.fn(),
}));

// Telemetry is irrelevant to what this file asserts, but useBookingFlow calls
// the hook unconditionally — so the mock has to supply it, not just the pushers.
// Spread the real module rather than listing exports — see the same mock in
// `session-facts-carry.test.tsx` for why. This suite seeds from a
// sessionStorage snapshot instead of walking the flow, so it did not break when
// `pushDateSelected` was added; it was one edit away from doing so.
jest.mock('@/lib/booking-telemetry', () => ({
  ...jest.requireActual('@/lib/booking-telemetry'),
  useStepViewedTelemetry: jest.fn(),
  pushStepViewed: jest.fn(),
}));

const FLOW_KEY = 'lengolf.bayBookingFlow';

/** A part-finished booking, as `useFlowPersistence` writes it. */
function saveSnapshot(overrides: Record<string, unknown> = {}) {
  sessionStorage.setItem(
    FLOW_KEY,
    JSON.stringify({
      currentStep: 3,
      selectedDateIso: new Date('2026-08-01T00:00:00.000Z').toISOString(),
      selectedTime: '10:00',
      selectedBayType: 'ai_lab',
      maxDuration: 3,
      selectedPackageId: null,
      selectedClubRental: 'standard',
      selectedClubSetId: null,
      selectedAddOns: {},
      selectedSlotData: null,
      ...overrides,
    }),
  );
}

describe('the bay choice survives a restore', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('a named bay comes back with the rest of the booking', async () => {
    saveSnapshot({ selectedBayType: 'ai_lab' });
    const { result } = renderHook(() => useBookingFlow());

    await waitFor(() => expect(result.current.currentStep).toBe(3));
    expect(result.current.selectedBayType).toBe('ai_lab');
  });

  test('Social comes back too, so the restore is not just an AI Lab special case', async () => {
    saveSnapshot({ selectedBayType: 'social' });
    const { result } = renderHook(() => useBookingFlow());

    await waitFor(() => expect(result.current.currentStep).toBe(3));
    expect(result.current.selectedBayType).toBe('social');
  });

  test('"All Bays" restores as no preference, not as a default bay', async () => {
    saveSnapshot({ selectedBayType: null });
    const { result } = renderHook(() => useBookingFlow());

    await waitFor(() => expect(result.current.currentStep).toBe(3));
    // The old flow seeded the step-3 picker with 'social' whenever the flow had
    // no bay, so a customer who chose "All Bays" was silently booked into a
    // Social bay. Restoring must not resurrect that.
    expect(result.current.selectedBayType).toBeNull();
  });

  test('a restored step 3 never lands with the bay still pending', async () => {
    // The step-3 header and the recap card both state the bay unconditionally
    // now, so there is no "not chosen yet" state left for a restore to land in:
    // whatever comes back is one of the three answers.
    saveSnapshot();
    const { result } = renderHook(() => useBookingFlow());

    await waitFor(() => expect(result.current.currentStep).toBe(3));
    expect(['social', 'ai_lab', null]).toContain(result.current.selectedBayType);
  });
});

describe('the bay choice survives back-navigation to the step that owns it', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('stepping back from step 3 leaves the choice on the flow', async () => {
    saveSnapshot({ selectedBayType: 'ai_lab' });
    const { result } = renderHook(() => useBookingFlow());
    await waitFor(() => expect(result.current.currentStep).toBe(3));

    act(() => result.current.handleBack());

    // Step 2 is exactly where the customer changes the bay — the AI Lab
    // group-size warning's back link exists to send them there — so clearing it
    // on the way out would reset the control they came back to use.
    expect(result.current.currentStep).toBe(2);
    expect(result.current.selectedBayType).toBe('ai_lab');
    // The start time IS dropped: they are re-picking a slot.
    expect(result.current.selectedTime).toBeNull();
  });

  test('the choice is changeable from step 2 without re-picking a time', async () => {
    saveSnapshot({ selectedBayType: 'ai_lab' });
    const { result } = renderHook(() => useBookingFlow());
    await waitFor(() => expect(result.current.currentStep).toBe(3));

    act(() => result.current.handleBack());
    act(() => result.current.handleBayTypeSelect('social'));
    expect(result.current.selectedBayType).toBe('social');

    act(() => result.current.handleBayTypeSelect(null));
    expect(result.current.selectedBayType).toBeNull();
  });
});

describe('picking a time does not re-supply the bay', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('the slot handler carries the slot only, leaving the bay untouched', async () => {
    const { result } = renderHook(() => useBookingFlow());
    await waitFor(() => expect(result.current.currentStep).toBe(1));

    act(() => result.current.handleBayTypeSelect('social'));
    act(() => result.current.handleTimeSelect('13:00', 2.5));

    expect(result.current.currentStep).toBe(3);
    expect(result.current.selectedTime).toBe('13:00');
    expect(result.current.maxDuration).toBe(2.5);
    // A `bayType` argument here was the second source of truth for the same
    // choice: the time step re-derived it from its own filter state and
    // overwrote the flow with it on every slot tap.
    expect(result.current.selectedBayType).toBe('social');
  });
});
