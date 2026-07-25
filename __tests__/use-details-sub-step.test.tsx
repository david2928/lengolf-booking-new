/**
 * Sub-step navigation for booking step 3 (Session -> Extras -> Your details).
 *
 * The sequence and the clamping at both ends are load-bearing: the header arrow
 * resolves "backward one level" against `isFirst`, and the sticky-bar CTA only
 * submits when `isLast`. If `nextSubStep` could run off the end, the CTA would
 * never reach the submit branch.
 */
import { act, renderHook } from '@testing-library/react';
import {
  DETAIL_SUB_STEPS,
  useDetailsSubStep,
} from '@/app/[locale]/(features)/bookings/components/booking/steps/details/useDetailsSubStep';

describe('useDetailsSubStep', () => {
  test('the sub-step sequence is session -> extras -> contact', () => {
    expect(DETAIL_SUB_STEPS).toEqual(['session', 'extras', 'contact']);
  });

  test('starts on the first sub-step', () => {
    const { result } = renderHook(() => useDetailsSubStep());

    expect(result.current.subStep).toBe('session');
    expect(result.current.subStepIndex).toBe(0);
    expect(result.current.isFirst).toBe(true);
    expect(result.current.isLast).toBe(false);
  });

  test('nextSubStep walks the sequence in order and stops at the last', () => {
    const { result } = renderHook(() => useDetailsSubStep());

    act(() => result.current.nextSubStep());
    expect(result.current.subStep).toBe('extras');
    expect(result.current.subStepIndex).toBe(1);
    expect(result.current.isFirst).toBe(false);
    expect(result.current.isLast).toBe(false);

    act(() => result.current.nextSubStep());
    expect(result.current.subStep).toBe('contact');
    expect(result.current.subStepIndex).toBe(2);
    expect(result.current.isLast).toBe(true);

    // Clamped: no fourth sub-step exists.
    act(() => result.current.nextSubStep());
    expect(result.current.subStep).toBe('contact');
    expect(result.current.isLast).toBe(true);

    // And still clamped after repeated taps.
    act(() => {
      result.current.nextSubStep();
      result.current.nextSubStep();
    });
    expect(result.current.subStep).toBe('contact');
  });

  test('prevSubStep walks back in order and stops at the first', () => {
    const { result } = renderHook(() => useDetailsSubStep());

    act(() => result.current.goToSubStep('contact'));
    act(() => result.current.prevSubStep());
    expect(result.current.subStep).toBe('extras');

    act(() => result.current.prevSubStep());
    expect(result.current.subStep).toBe('session');
    expect(result.current.isFirst).toBe(true);

    // Clamped: the header arrow falls through to leaving step 3 instead.
    act(() => result.current.prevSubStep());
    expect(result.current.subStep).toBe('session');
    expect(result.current.subStepIndex).toBe(0);
    expect(result.current.isFirst).toBe(true);

    act(() => {
      result.current.prevSubStep();
      result.current.prevSubStep();
    });
    expect(result.current.subStep).toBe('session');
  });

  test('goToSubStep jumps straight to a named sub-step', () => {
    const { result } = renderHook(() => useDetailsSubStep());

    // Forward, skipping one (there is no such affordance today, but Change must
    // not care how far it jumps).
    act(() => result.current.goToSubStep('contact'));
    expect(result.current.subStep).toBe('contact');
    expect(result.current.subStepIndex).toBe(2);
    expect(result.current.isLast).toBe(true);

    // Backward, which is what the Change links on the collapsed summaries do.
    act(() => result.current.goToSubStep('session'));
    expect(result.current.subStep).toBe('session');
    expect(result.current.subStepIndex).toBe(0);
    expect(result.current.isFirst).toBe(true);
    expect(result.current.isLast).toBe(false);

    act(() => result.current.goToSubStep('extras'));
    expect(result.current.subStep).toBe('extras');
    expect(result.current.subStepIndex).toBe(1);
  });

  test('every sub-step is reachable by name', () => {
    const { result } = renderHook(() => useDetailsSubStep());

    for (const step of DETAIL_SUB_STEPS) {
      act(() => result.current.goToSubStep(step));
      expect(result.current.subStep).toBe(step);
      expect(result.current.subStepIndex).toBe(DETAIL_SUB_STEPS.indexOf(step));
    }
  });
});
