'use client';

import { useCallback, useMemo, useState } from 'react';

/**
 * The three screens booking step 3 is split into on mobile, in the order the
 * customer walks them. Index order is load-bearing: `nextSubStep` /
 * `prevSubStep` and the "completed sub-steps collapse to a summary" rule both
 * derive from position in this array.
 */
export const DETAIL_SUB_STEPS = ['session', 'extras', 'contact'] as const;
export type DetailSubStep = (typeof DETAIL_SUB_STEPS)[number];

export interface DetailsSubStepNav {
  /** The sub-step the customer is on. */
  subStep: DetailSubStep;
  /** Its position in `DETAIL_SUB_STEPS`, 0-based. */
  subStepIndex: number;
  /** Jump straight to a named sub-step (the "Change" links). */
  goToSubStep: (next: DetailSubStep) => void;
  /** Forward one sub-step. No-op on the last one. */
  nextSubStep: () => void;
  /** Backward one sub-step. No-op on the first one. */
  prevSubStep: () => void;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * Sub-step navigation for booking step 3.
 *
 * Deliberately component state and NOT the URL: the top-level wizard step
 * already lives in `useBookingFlow`, and a second source of navigation truth
 * would be free to disagree with it — and would have to interact with the
 * `useFlowPersistence` restore. The consequence is that browser/gesture back
 * exits step 3 rather than stepping back a sub-step, which is exactly how the
 * top-level wizard already behaves (Date, Time and Details share one URL), so
 * it is not a regression.
 *
 * This hook is called from `useBookingFlow` rather than from `BookingDetails`,
 * so the header arrow in `page.tsx` can resolve "backward one level" against
 * the sub-step before falling through to `handleBack`.
 */
export function useDetailsSubStep(): DetailsSubStepNav {
  const [subStep, setSubStep] = useState<DetailSubStep>(DETAIL_SUB_STEPS[0]);

  const subStepIndex = DETAIL_SUB_STEPS.indexOf(subStep);

  const goToSubStep = useCallback((next: DetailSubStep) => {
    setSubStep(next);
  }, []);

  const nextSubStep = useCallback(() => {
    setSubStep((current) => {
      const i = DETAIL_SUB_STEPS.indexOf(current);
      return i < DETAIL_SUB_STEPS.length - 1 ? DETAIL_SUB_STEPS[i + 1] : current;
    });
  }, []);

  const prevSubStep = useCallback(() => {
    setSubStep((current) => {
      const i = DETAIL_SUB_STEPS.indexOf(current);
      return i > 0 ? DETAIL_SUB_STEPS[i - 1] : current;
    });
  }, []);

  return useMemo(
    () => ({
      subStep,
      subStepIndex,
      goToSubStep,
      nextSubStep,
      prevSubStep,
      isFirst: subStepIndex === 0,
      isLast: subStepIndex === DETAIL_SUB_STEPS.length - 1,
    }),
    [subStep, subStepIndex, goToSubStep, nextSubStep, prevSubStep],
  );
}
