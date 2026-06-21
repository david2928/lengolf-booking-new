import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getPlayFoodPackages, type PlayFoodPackage } from '@/types/play-food-packages';
import { GOLF_CLUB_OPTIONS } from '@/types/golf-club-rental';
import { BayType } from '@/lib/bayConfig';
import type { TimeSlot } from './useAvailability';
import { useFlowPersistence } from '@/lib/use-flow-persistence';

export function useBookingFlow() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedBayType, setSelectedBayType] = useState<BayType | null>(null);
  const [maxDuration, setMaxDuration] = useState<number>(1);
  const [isAutoSelecting, setIsAutoSelecting] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PlayFoodPackage | null>(null);
  const [selectedClubRental, setSelectedClubRental] = useState<string>('standard');
  const [selectedClubSetId, setSelectedClubSetId] = useState<string | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<Record<string, boolean>>({});
  const [selectedSlotData, setSelectedSlotData] = useState<TimeSlot | null>(null);

  const hasDeepLink = !!(
    searchParams &&
    (searchParams.get('selectDate') || searchParams.get('package') || searchParams.get('club'))
  );

  // Persist the in-progress booking so switching language (which remounts the
  // page under a different /[locale] route) doesn't reset the wizard to step 1.
  // Cleared on the confirmation page; skips restore when a deep-link / auth-return
  // param is present so those flows keep ownership of the initial state.
  useFlowPersistence(
    'lengolf.bayBookingFlow',
    {
      currentStep,
      selectedDateIso: selectedDate && !Number.isNaN(selectedDate.getTime()) ? selectedDate.toISOString() : null,
      selectedTime,
      selectedBayType,
      maxDuration,
      selectedPackageId: selectedPackage ? selectedPackage.id : null,
      selectedClubRental,
      selectedClubSetId,
      selectedAddOns,
      selectedSlotData,
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
      if (s.selectedBayType) setSelectedBayType(s.selectedBayType);
      if (s.maxDuration) setMaxDuration(s.maxDuration);
      if (s.selectedPackageId) {
        const pkg = getPlayFoodPackages().find((p) => p.id === s.selectedPackageId);
        if (pkg) setSelectedPackage(pkg);
      }
      if (s.selectedClubRental) setSelectedClubRental(s.selectedClubRental);
      if (s.selectedClubSetId) setSelectedClubSetId(s.selectedClubSetId);
      if (s.selectedAddOns) setSelectedAddOns(s.selectedAddOns);
      if (s.selectedSlotData) setSelectedSlotData(s.selectedSlotData);
    },
  );

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

      // Handle date parameter (existing logic)
      if (status === 'authenticated' && dateParam) {
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
  }, [status, searchParams, isAutoSelecting, router, selectedPackage]);

  const handleDateSelect = (date: Date) => {
    if (status === 'unauthenticated') {
      let callbackUrl = `/bookings?selectDate=${date.toISOString()}`;
      if (selectedPackage) {
        callbackUrl += `&package=${selectedPackage.id}`;
      }
      if (selectedClubRental && selectedClubRental !== 'none') {
        callbackUrl += `&club=${selectedClubRental}`;
      }
      signIn(undefined, { callbackUrl });
      return;
    }

    setSelectedDate(date);
    setCurrentStep(2);
  };

  const handleTimeSelect = (time: string, maxHours: number, bayType?: BayType, slotData?: TimeSlot) => {
    setSelectedTime(time);
    setMaxDuration(maxHours);
    setSelectedBayType(bayType || null);
    setSelectedSlotData(slotData || null);
    setCurrentStep(3);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      if (currentStep === 2) {
        setSelectedDate(null);
      } else if (currentStep === 3) {
        setSelectedTime(null);
        setSelectedBayType(null);
      }
      setCurrentStep(currentStep - 1);
    }
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
    handleTimeSelect,
    handleBack,
    getMaxDuration,
    getFixedPeople,
    isPackageMode,
  };
} 