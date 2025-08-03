import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PLAY_FOOD_PACKAGES, type PlayFoodPackage } from '@/types/play-food-packages';
import { GOLF_CLUB_OPTIONS } from '@/types/golf-club-rental';
import { useI18nRouter } from '@/lib/i18n/navigation';

export function useBookingFlow() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  let searchParams: URLSearchParams | null = null;
  try {
    searchParams = useSearchParams();
  } catch (error) {
    // Handle SSR or build-time issues with useSearchParams
    searchParams = null;
  }
  
  const { getCurrentLocale } = useI18nRouter();

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [maxDuration, setMaxDuration] = useState<number>(1);
  const [isAutoSelecting, setIsAutoSelecting] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PlayFoodPackage | null>(null);
  const [selectedClubRental, setSelectedClubRental] = useState<string>('none');

  useEffect(() => {
    if (searchParams && !isAutoSelecting) {
      const packageParam = searchParams.get('package');
      const dateParam = searchParams.get('selectDate');
      const clubParam = searchParams.get('club');
      
      // Handle package parameter
      if (packageParam && !selectedPackage) {
        const pkg = PLAY_FOOD_PACKAGES.find(p => p.id === packageParam);
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

          const currentLocale = getCurrentLocale();
          const bookingUrl = currentLocale !== 'en' ? `/bookings?lang=${currentLocale}` : '/bookings';
          router.replace(bookingUrl, { scroll: false }); 

        } catch (error) {
          console.error("Error processing selectDate param:", error);
          const currentLocale = getCurrentLocale();
          const bookingUrl = currentLocale !== 'en' ? `/bookings?lang=${currentLocale}` : '/bookings';
          router.replace(bookingUrl, { scroll: false }); 
        } finally {
            setIsAutoSelecting(false);
        }
      }
    }
  }, [status, searchParams, isAutoSelecting, router]);

  const handleDateSelect = (date: Date) => {
    if (status === 'unauthenticated') {
      const currentLocale = getCurrentLocale();
      let callbackUrl = `/bookings?selectDate=${date.toISOString()}`;
      if (selectedPackage) {
        callbackUrl += `&package=${selectedPackage.id}`;
      }
      if (selectedClubRental && selectedClubRental !== 'none') {
        callbackUrl += `&club=${selectedClubRental}`;
      }
      if (currentLocale !== 'en') {
        callbackUrl += `&lang=${currentLocale}`;
        // Also add language to the sign-in redirect URL
        window.location.href = `/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}&lang=${currentLocale}`;
        return;
      }
      signIn(undefined, { callbackUrl });
      return;
    }

    setSelectedDate(date);
    setCurrentStep(2);
  };

  const handleTimeSelect = (time: string, maxHours: number) => {
    setSelectedTime(time);
    setMaxDuration(maxHours);
    setCurrentStep(3);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      if (currentStep === 2) {
        setSelectedDate(null);
      } else if (currentStep === 3) {
        setSelectedTime(null);
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
    maxDuration,
    isAutoSelecting,
    selectedPackage,
    selectedClubRental,
    setSelectedClubRental,
    handleDateSelect,
    handleTimeSelect,
    handleBack,
    getMaxDuration,
    getFixedPeople,
    isPackageMode,
  };
} 