import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

export function useBookingFlow() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [maxDuration, setMaxDuration] = useState<number>(1);
  const [isAutoSelecting, setIsAutoSelecting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && searchParams && !isAutoSelecting) {
      const dateParam = searchParams.get('selectDate');
      
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
  }, [status, isAutoSelecting]);

  const handleDateSelect = (date: Date) => {
    if (status === 'unauthenticated') {
      const callbackUrl = `/bookings?selectDate=${date.toISOString()}`;
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

  return {
    currentStep,
    selectedDate,
    selectedTime,
    maxDuration,
    isAutoSelecting,
    handleDateSelect,
    handleTimeSelect,
    handleBack,
  };
} 