import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getPlayFoodPackages, type PlayFoodPackage } from '@/types/play-food-packages';
import { GOLF_CLUB_OPTIONS } from '@/types/golf-club-rental';
import { BayType } from '@/lib/bayConfig';
import type { TimeSlot } from './useAvailability';
import { useFlowPersistence } from '@/lib/use-flow-persistence';
import { pushBayBookingStepViewed } from '@/lib/booking-telemetry';
import { useDetailsSubStep, DETAIL_SUB_STEPS } from '../components/booking/steps/details/useDetailsSubStep';

export function useBookingFlow() {
  // Deliberately no useSession here. The flow no longer branches on auth state
  // at all, and reading it would put a session round-trip back on the critical
  // path of the first paint for every anonymous visitor.
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  /**
   * The bay type the customer wants, chosen ONCE on step 2 and carried from
   * there — the same single `bayPreference` the LIFF flow has always had.
   *
   * `null` is a real answer, not an unset field: it is "All Bays", i.e. no
   * preference, which `/api/bookings/create` honours by assigning whichever bay
   * is free. So this is optional exactly as LIFF's is, and step 3 never asks
   * again.
   *
   * It lives HERE rather than inside `TimeSlots` because step 2 unmounts: the
   * choice has to survive stepping forward to step 3, stepping back to step 2,
   * and a sessionStorage restore after a language switch. A component-local
   * filter could survive none of those.
   */
  const [selectedBayType, setSelectedBayType] = useState<BayType | null>(null);
  const [maxDuration, setMaxDuration] = useState<number>(1);
  /**
   * How long the session is and how many people are coming.
   *
   * Both are SET on step 3 and both live here, which looks like a layering
   * mistake until you look at what leaving step 3 does: `handleBack` nulls
   * `selectedTime`, `page.tsx` renders step 3 only while a time is set, so
   * `BookingDetails` unmounts and every `useState` inside
   * `useBookingDetailsForm` resets to its initial value. A customer who stepped
   * back to nudge their start time came forward to a 1-hour booking for one
   * person, with nothing on screen to say their answers had been dropped.
   *
   * That was survivable while the only way back was the header's back arrow.
   * The session sub-step's slot chip now offers "Change" on the row itself, so
   * the trip is the advertised path rather than a corner, and these two had to
   * move to where `selectedBayType`, `selectedClubRental` and `selectedAddOns`
   * already are — the state that outlives a step.
   *
   * NEITHER is a property of the slot, which is what makes carrying them
   * correct rather than merely convenient: a party of four is still a party of
   * four half an hour later. Duration is the one that needs a guard, because
   * the new slot may have less headroom than the old one — see the ladder-clamp
   * effect in `useBookingDetailsForm`, which snaps a carried duration back onto
   * the ladder for the slot it lands in. The carry is deliberately NOT clamped
   * here: this hook does not know the chosen bay type's headroom, and a second
   * clamp against the coarser `maxDuration` would cut lengths the finer one
   * allows.
   */
  const [duration, setDuration] = useState<number>(1);
  const [numberOfPeople, setNumberOfPeople] = useState<number>(1);
  const [isAutoSelecting, setIsAutoSelecting] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PlayFoodPackage | null>(null);
  const [selectedClubRental, setSelectedClubRental] = useState<string>('standard');
  const [selectedClubSetId, setSelectedClubSetId] = useState<string | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<Record<string, boolean>>({});
  const [selectedSlotData, setSelectedSlotData] = useState<TimeSlot | null>(null);

  /**
   * The customer's note and their marketing consent, held HERE rather than in
   * `useBookingDetailsForm`, for the same reason `duration` and
   * `numberOfPeople` are: they outlive a slot change.
   *
   * `handleBack` from step 3 nulls `selectedTime`, and `page.tsx` renders step
   * 3 only while a time is set — so the whole of `BookingDetails` unmounts and
   * every `useState` inside its form hook resets, silently, with nothing on
   * screen to say so. That was harmless while the only control reaching
   * `handleBack` sat on the FIRST sub-step, where neither of these has been
   * touched yet. The step header's "Change" now offers the same trip from the
   * review sub-step, one tap from Confirm and with a typed note on screen.
   *
   * So they move up here with the rest of what survives. See
   * `__tests__/session-facts-carry.test.tsx`, which states the rule: the fix is
   * not to soften the navigation, it is to move the facts that outlive a slot
   * change onto the flow.
   */
  const [customerNotes, setCustomerNotes] = useState<string>('');
  const [marketingOptIn, setMarketingOptIn] = useState<boolean>(false);

  // Step 3 is presented as three sub-steps on mobile. The sub-step lives here,
  // beside `currentStep`, so this hook stays the single source of navigation
  // truth and the header arrow in page.tsx can resolve "backward one level"
  // without reaching into BookingDetails. Deliberately NOT part of the
  // `useFlowPersistence` snapshot below: a restored booking always resumes at
  // the first sub-step, which is always safe to render.
  const detailsSubStep = useDetailsSubStep();
  const { goToSubStep: goToDetailsSubStep, prevSubStep: prevDetailsSubStep, isFirst: isFirstDetailsSubStep } = detailsSubStep;

  const hasDeepLink = !!(
    searchParams &&
    (searchParams.get('selectDate') || searchParams.get('package') || searchParams.get('club'))
  );

  // Persist the in-progress booking so switching language (which remounts the
  // page under a different /[locale] route) doesn't reset the wizard to step 1.
  // Cleared on the confirmation page; skips restore when a deep-link / auth-return
  // param is present so those flows keep ownership of the initial state.
  const flowRestored = useFlowPersistence(
    'lengolf.bayBookingFlow',
    {
      currentStep,
      selectedDateIso: selectedDate && !Number.isNaN(selectedDate.getTime()) ? selectedDate.toISOString() : null,
      selectedTime,
      selectedBayType,
      maxDuration,
      duration,
      numberOfPeople,
      selectedPackageId: selectedPackage ? selectedPackage.id : null,
      selectedClubRental,
      selectedClubSetId,
      selectedAddOns,
      selectedSlotData,
      customerNotes,
      marketingOptIn,
    },
    (s) => {
      if (hasDeepLink) return;
      // Clamp the restored step to what the saved data supports (avoids a blank
      // step-2/3 render if the snapshot is partial/corrupt).
      const wantStep = s.currentStep ?? 1;
      const canStep2 = !!s.selectedDateIso;
      const canStep3 = !!(s.selectedDateIso && s.selectedTime);
      setCurrentStep(wantStep >= 3 && canStep3 ? 3 : wantStep >= 2 && canStep2 ? 2 : 1);
      if (s.selectedDateIso) setSelectedDate(new Date(s.selectedDateIso));
      if (s.selectedTime) setSelectedTime(s.selectedTime);
      // A saved `null` needs no restore: it IS the initial value, and it means
      // "All Bays" rather than "not chosen yet", so the truthiness guard here
      // reads as "only overwrite the default when there is something else to
      // say" and lands on the right answer for all three states.
      if (s.selectedBayType) setSelectedBayType(s.selectedBayType);
      if (s.maxDuration) setMaxDuration(s.maxDuration);
      // Truthiness rather than `!== undefined`, and it lands right for both
      // cases: a snapshot written before these were carried has neither key,
      // and neither value is ever legitimately 0 or NaN — `allowedDurations`
      // floors at 1 rung and the party picker at 1 seat. Restoring `undefined`
      // over the defaults would put it straight into `calculateCost`.
      if (s.duration) setDuration(s.duration);
      if (s.numberOfPeople) setNumberOfPeople(s.numberOfPeople);
      if (s.selectedPackageId) {
        const pkg = getPlayFoodPackages().find((p) => p.id === s.selectedPackageId);
        if (pkg) setSelectedPackage(pkg);
      }
      if (s.selectedClubRental) setSelectedClubRental(s.selectedClubRental);
      if (s.selectedClubSetId) setSelectedClubSetId(s.selectedClubSetId);
      if (s.selectedAddOns) setSelectedAddOns(s.selectedAddOns);
      if (s.selectedSlotData) setSelectedSlotData(s.selectedSlotData);
      // Truthiness again, and again it lands right: an empty note and an
      // unticked box ARE the defaults, so there is nothing to restore either
      // way, and a snapshot written before these were carried has neither key.
      if (s.customerNotes) setCustomerNotes(s.customerNotes);
      if (s.marketingOptIn) setMarketingOptIn(s.marketingOptIn);
    },
  );

  // Report the step the customer actually lands on. Gated on `flowRestored`
  // because useFlowPersistence restores in a mount effect: without the gate this
  // fires for the initial step 1 and then the restored step, inventing a `date`
  // view and skipping the restored step's predecessor entirely.
  useEffect(() => {
    if (!flowRestored) return;
    pushBayBookingStepViewed(currentStep);
  }, [flowRestored, currentStep]);

  useEffect(() => {
    if (searchParams && !isAutoSelecting) {
      const packageParam = searchParams.get('package');
      const dateParam = searchParams.get('selectDate');
      const clubParam = searchParams.get('club');
      
      // Handle package parameter
      if (packageParam && !selectedPackage) {
        const pkg = getPlayFoodPackages().find(p => p.id === packageParam);
        if (pkg) {
          setSelectedPackage(pkg);
          console.log(`[useBookingFlow] Package selected: ${pkg.name}`);
        }
      }

      // Handle club rental parameter
      if (clubParam && GOLF_CLUB_OPTIONS.find(c => c.id === clubParam)) {
        setSelectedClubRental(clubParam);
        console.log(`[useBookingFlow] Club rental selected: ${clubParam}`);
      }

      // Gated on `authenticated` while the flow required a session to reach
      // step 2. Anonymous visitors can now walk the whole flow, and a marketing
      // deep-link carrying ?selectDate= is aimed at exactly them — leaving the
      // check in would have silently ignored the parameter for the audience the
      // link was built for.
      if (dateParam) {
        setIsAutoSelecting(true);
        try {
          const selectedDateFromParam = new Date(dateParam);
          
          if (isNaN(selectedDateFromParam.getTime())) {
            throw new Error('Invalid date parameter');
          }

          setSelectedDate(selectedDateFromParam);
          setCurrentStep(2); 

          router.replace('/bookings', { scroll: false }); 

        } catch (error) {
          console.error("Error processing selectDate param:", error);
          router.replace('/bookings', { scroll: false }); 
        } finally {
            setIsAutoSelecting(false);
        }
      }
    }
  }, [searchParams, isAutoSelecting, router, selectedPackage]);

  // Picking a date used to bounce anonymous visitors to /auth/login. That gate
  // fired ~6 seconds after landing, before anyone saw a single time slot, and
  // it was the first of six. Signing in is now offered on the details step as a
  // shortcut, and a guest session is minted at submit from the contact details
  // the customer types there anyway.
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setCurrentStep(2);
  };

  /**
   * Step 2's bay control. Separate from `handleTimeSelect` because the bay is
   * chosen BEFORE a slot — it narrows which slots are offered — and because it
   * must be changeable without re-picking a time.
   */
  const handleBayTypeSelect = (bayType: BayType | null) => {
    setSelectedBayType(bayType);
  };

  // No `bayType` argument: the bay is already in flow state by the time a slot
  // is tapped, and taking it here as well would give the same choice two
  // sources that could disagree.
  const handleTimeSelect = (time: string, maxHours: number, slotData?: TimeSlot) => {
    setSelectedTime(time);
    setMaxDuration(maxHours);
    setSelectedSlotData(slotData || null);
    goToDetailsSubStep(DETAIL_SUB_STEPS[0]);
    setCurrentStep(3);
  };

  // Leaves the current wizard step. Unchanged: callers that mean "get me out of
  // step 3" (the AI Lab warning's back link, the no-availability modal) keep
  // passing this, so they must NOT become sub-step-aware.
  //
  // `selectedBayType` is deliberately NOT cleared on the way out of step 3. It
  // is step 2's own answer, and step 2 is exactly where this lands the
  // customer — clearing it would reset the control they came back to change.
  // That is the whole point of the AI Lab warning's back link below.
  const handleBack = () => {
    if (currentStep > 1) {
      if (currentStep === 2) {
        setSelectedDate(null);
      } else if (currentStep === 3) {
        setSelectedTime(null);
        goToDetailsSubStep(DETAIL_SUB_STEPS[0]);
      }
      setCurrentStep(currentStep - 1);
    }
  };

  // The header arrow's action: backward exactly one level. Inside step 3 that
  // means the previous sub-step; from step 3's first sub-step (and from every
  // other step) it means the previous wizard step.
  const handleHeaderBack = () => {
    if (currentStep === 3 && !isFirstDetailsSubStep) {
      prevDetailsSubStep();
      return;
    }
    handleBack();
  };

  // Package-related helper functions
  const getMaxDuration = () => {
    return selectedPackage ? selectedPackage.duration : maxDuration;
  };

  const getFixedPeople = () => {
    return selectedPackage ? 5 : null;
  };

  const isPackageMode = () => {
    return selectedPackage !== null;
  };

  return {
    currentStep,
    selectedDate,
    selectedTime,
    selectedBayType,
    maxDuration,
    duration,
    setDuration,
    numberOfPeople,
    setNumberOfPeople,
    customerNotes,
    setCustomerNotes,
    marketingOptIn,
    setMarketingOptIn,
    isAutoSelecting,
    selectedPackage,
    selectedClubRental,
    selectedClubSetId,
    selectedAddOns,
    selectedSlotData,
    setSelectedClubRental,
    setSelectedClubSetId,
    setSelectedAddOns,
    handleDateSelect,
    handleBayTypeSelect,
    handleTimeSelect,
    handleBack,
    handleHeaderBack,
    detailsSubStep,
    getMaxDuration,
    getFixedPeople,
    isPackageMode,
  };
} 