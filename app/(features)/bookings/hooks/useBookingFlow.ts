import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PLAY_FOOD_PACKAGES, type PlayFoodPackage } from '@/types/play-food-packages';

export function useBookingFlow() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [maxDuration, setMaxDuration] = useState<number>(1);
  const [isAutoSelecting, setIsAutoSelecting] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PlayFoodPackage | null>(null);

  useEffect(() => {
    if (searchParams && !isAutoSelecting) {
      const packageParam = searchParams.get('package');
      const dateParam = searchParams.get('selectDate');
      
      // Handle package parameter
      if (packageParam && !selectedPackage) {
        const pkg = PLAY_FOOD_PACKAGES.find(p => p.id === packageParam);
        if (pkg) {
          setSelectedPackage(pkg);
          console.log(`[useBookingFlow] Package selected: ${pkg.name}`);
        }
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
  }, [status, searchParams, isAutoSelecting, router]);

  const handleDateSelect = (date: Date) => {
    if (status === 'unauthenticated') {
      let callbackUrl = `/bookings?selectDate=${date.toISOString()}`;
      if (selectedPackage) {
        callbackUrl += `&package=${selectedPackage.id}`;
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
    handleDateSelect,
    handleTimeSelect,
    handleBack,
    getMaxDuration,
    getFixedPeople,
    isPackageMode,
  };
} 