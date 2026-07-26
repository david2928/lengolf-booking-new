/**
 * The session facts survive a trip back to step 2 and forward again.
 *
 * WHY THIS FILE EXISTS
 *
 * Booking step 3's first sub-step used to state the date, the start time and the
 * bay on three read-only cards with no way back to any of them. They are now one
 * chip whose "Change" leaves step 3 for step 2, which is where the start time and
 * the bay are chosen. That turns a control the customer previously had to hunt
 * for (the header's back arrow) into an obvious one on the row itself — so the
 * round trip stops being rare and starts being the advertised path.
 *
 * And the round trip is destructive by construction: `handleBack` nulls
 * `selectedTime`, `page.tsx` renders step 3 only while a time is set, so
 * `BookingDetails` UNMOUNTS and every `useState` inside `useBookingDetailsForm`
 * resets. Anything the customer had already set that lives in that hook is gone,
 * silently, with no error and nothing on screen to say so.
 *
 * The fix is not to soften the navigation — re-picking a slot really does mean
 * re-picking a slot — but to move the facts that OUTLIVE a slot change onto the
 * flow, beside `selectedBayType` and `selectedClubRental`, which already survive
 * it. Duration and party size are exactly that kind of fact: neither is a
 * property of the slot, and a customer booking 2.5 hours for four people wants
 * both of those still true after they nudge their start time by half an hour.
 *
 * Duration needs one extra guarantee the others do not: the new slot may have
 * less headroom than the old one, so a carried duration must not be able to
 * outrun it. `useBookingDetailsForm`'s ladder-clamp effect owns that, and the
 * last test here pins the pairing so the carry cannot be read as a promise that
 * any duration survives any slot.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBookingFlow } from '@/app/[locale]/(features)/bookings/hooks/useBookingFlow';
import { allowedDurations } from '@/lib/booking-durations';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated' }),
  signIn: jest.fn(),
}));

jest.mock('@/lib/booking-telemetry', () => ({
  pushBayBookingStepViewed: jest.fn(),
}));

const BOOKING_DATE = new Date(2026, 6, 26, 0, 0);

/**
 * Walk the flow to step 3 the way a customer does, then set the session facts.
 *
 * Deliberately NOT seeded from a sessionStorage snapshot like
 * `bay-choice-carry` does: a snapshot restore proves the values can come back
 * from storage, and what is in question here is whether they survive an
 * in-session navigation that never touches storage at all.
 */
async function flowAtStepThree() {
  const { result } = renderHook(() => useBookingFlow());
  await waitFor(() => expect(result.current.currentStep).toBe(1));

  act(() => result.current.handleDateSelect(BOOKING_DATE));
  act(() => result.current.handleBayTypeSelect(null));
  act(() => result.current.handleTimeSelect('20:30', 3));

  return result;
}

describe("the chip's Change leaves step 3 for step 2", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('lands on the step that owns the start time and the bay', async () => {
    const result = await flowAtStepThree();

    act(() => result.current.handleBack());

    expect(result.current.currentStep).toBe(2);
    // The date is untouched, so step 2 renders the same day's slots. Reaching
    // the DATE is step 2's own back arrow, one more level up — which is why the
    // chip's label names the time and the bay and stops there.
    expect(result.current.selectedDate).not.toBeNull();
    // The start time IS dropped: they are re-picking a slot.
    expect(result.current.selectedTime).toBeNull();
  });
});

describe('what the customer already chose on step 3 survives the round trip', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('duration and party size come back, not reset to the 1/1 defaults', async () => {
    const result = await flowAtStepThree();

    act(() => {
      result.current.setDuration(2.5);
      result.current.setNumberOfPeople(4);
    });

    // Out to step 2 and back in on a different slot — the whole point of the
    // chip's Change.
    act(() => result.current.handleBack());
    act(() => result.current.handleTimeSelect('21:00', 3));

    expect(result.current.currentStep).toBe(3);
    expect(result.current.selectedTime).toBe('21:00');
    expect(result.current.duration).toBe(2.5);
    expect(result.current.numberOfPeople).toBe(4);
  });

  /**
   * These three already lived on the flow before the chip existed. Pinned here
   * anyway: the chip is what makes this trip a routine one, so "extras survive"
   * stops being an incidental property and becomes a requirement.
   */
  test('the club rental, the club set and the add-ons come back too', async () => {
    const result = await flowAtStepThree();

    act(() => {
      result.current.setSelectedClubRental('premium');
      result.current.setSelectedClubSetId('set-7');
      result.current.setSelectedAddOns({ glove: true });
    });

    act(() => result.current.handleBack());
    act(() => result.current.handleTimeSelect('21:00', 3));

    expect(result.current.selectedClubRental).toBe('premium');
    expect(result.current.selectedClubSetId).toBe('set-7');
    expect(result.current.selectedAddOns).toEqual({ glove: true });
  });

  test('the bay preference is not reset by the trip, including "All Bays"', async () => {
    const result = await flowAtStepThree();

    act(() => result.current.handleBack());
    act(() => result.current.handleTimeSelect('21:00', 3));

    // `null` is a real answer meaning no preference, so it has to survive as
    // itself rather than being repaired into a default.
    expect(result.current.selectedBayType).toBeNull();
  });

  /**
   * The flow snapshot is what carries a booking across a language switch, which
   * remounts the page under a different `[locale]` route. Session facts that
   * live only inside `BookingDetails` were lost by that too — this is the same
   * bug through a different door, and the same fix closes both.
   */
  test('duration and party size are written into the persisted snapshot', async () => {
    const result = await flowAtStepThree();

    act(() => {
      result.current.setDuration(2);
      result.current.setNumberOfPeople(3);
    });

    await waitFor(() => {
      const saved = JSON.parse(sessionStorage.getItem('lengolf.bayBookingFlow') ?? '{}');
      expect(saved.duration).toBe(2);
      expect(saved.numberOfPeople).toBe(3);
    });
  });

  test('a restored snapshot brings them back', async () => {
    sessionStorage.setItem(
      'lengolf.bayBookingFlow',
      JSON.stringify({
        currentStep: 3,
        selectedDateIso: BOOKING_DATE.toISOString(),
        selectedTime: '20:30',
        selectedBayType: null,
        maxDuration: 3,
        duration: 2.5,
        numberOfPeople: 4,
        selectedPackageId: null,
        selectedClubRental: 'standard',
        selectedClubSetId: null,
        selectedAddOns: {},
        selectedSlotData: null,
      }),
    );

    const { result } = renderHook(() => useBookingFlow());
    await waitFor(() => expect(result.current.currentStep).toBe(3));

    expect(result.current.duration).toBe(2.5);
    expect(result.current.numberOfPeople).toBe(4);
  });

  /**
   * A snapshot written before these two existed has neither key. Restoring
   * `undefined` over the initial state would put `duration` into the cost
   * calculator as NaN-adjacent garbage, so the restore has to leave the
   * defaults standing.
   */
  test('a snapshot from before they were carried leaves the defaults alone', async () => {
    sessionStorage.setItem(
      'lengolf.bayBookingFlow',
      JSON.stringify({
        currentStep: 3,
        selectedDateIso: BOOKING_DATE.toISOString(),
        selectedTime: '20:30',
        selectedBayType: null,
        maxDuration: 3,
        selectedPackageId: null,
        selectedClubRental: 'standard',
        selectedClubSetId: null,
        selectedAddOns: {},
        selectedSlotData: null,
      }),
    );

    const { result } = renderHook(() => useBookingFlow());
    await waitFor(() => expect(result.current.currentStep).toBe(3));

    expect(result.current.duration).toBe(1);
    expect(result.current.numberOfPeople).toBe(1);
  });
});

/**
 * The carry must not be able to promise a length the new slot cannot serve.
 * `useBookingDetailsForm` snaps a carried duration back onto the ladder for the
 * slot it lands in; this pins the arithmetic that effect relies on, so the two
 * halves of the guarantee are stated together rather than one being inferred
 * from the other.
 */
describe('a carried duration cannot outrun the slot it lands in', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('the ladder for a shorter slot does not contain the longer selection', async () => {
    const result = await flowAtStepThree();

    act(() => result.current.setDuration(2.5));
    act(() => result.current.handleBack());
    // Half the headroom of the slot they came from.
    act(() => result.current.handleTimeSelect('22:00', 1.5));

    // The flow carries the customer's answer forward verbatim...
    expect(result.current.duration).toBe(2.5);
    // ...and the form's clamp is what refuses it, because the rung is not on
    // the new slot's ladder at all.
    const ladder = allowedDurations({ maxHours: result.current.maxDuration, hasActivePackage: false });
    expect(ladder).not.toContain(2.5);
    expect(ladder[ladder.length - 1]).toBe(1.5);
  });
});
