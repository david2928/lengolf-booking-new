'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { TimeSlots } from './components/booking/steps/TimeSlots';
import { BookingDetails } from './components/booking/steps/BookingDetails';
import { DateSelection } from './components/booking/steps/DateSelection';
import { Layout } from './components/booking/Layout';
import { PageTransition } from '@/components/shared/PageTransition';
import { useBookingFlow } from './hooks/useBookingFlow';

export default function BookingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const {
    currentStep,
    selectedDate,
    selectedTime,
    maxDuration,
    handleDateSelect,
    handleTimeSelect,
    handleBack,
  } = useBookingFlow();

  useEffect(() => {
    const initAuth = async () => {
      const supabase = createClient();
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error || !user) {
        router.push('/auth/login');
        return;
      }

      setUser(user);
    };

    initAuth();
  }, []);

  const renderContent = () => (
    <div className="min-h-[36rem]">
      {/* Page Title and Back Button */}
      <div className="mb-6 flex items-start">
        {currentStep > 1 && (
          <button
            onClick={handleBack}
            className="mr-4 p-2 rounded-lg hover:bg-gray-100"
            aria-label="Go back"
          >
            <ArrowLeftIcon className="h-6 w-6 text-gray-600" />
          </button>
        )}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {currentStep === 1 
              ? 'Select Date'
              : currentStep === 2
              ? 'Select Time'
              : 'Provide Details'
            }
          </h2>
          <p className="text-gray-600 mt-1">
            {currentStep === 1 
              ? 'Choose when you\'d like to play.'
              : currentStep === 2
              ? format(selectedDate!, 'EEE, d MMM yyyy')
              : 'Complete your booking details.'
            }
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative">
        {currentStep === 1 && (
          <DateSelection onDateSelect={handleDateSelect} />
        )}

        {currentStep === 2 && selectedDate && (
          <TimeSlots
            selectedDate={selectedDate}
            onTimeSelect={handleTimeSelect}
            onBack={handleBack}
          />
        )}

        {currentStep === 3 && selectedDate && selectedTime && user && (
          <BookingDetails
            user={user}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            maxDuration={maxDuration}
            onBack={handleBack}
          />
        )}
      </div>
    </div>
  );

  return (
    <Layout>
      {user && (
        <PageTransition>
          {renderContent()}
        </PageTransition>
      )}
    </Layout>
  );
} 