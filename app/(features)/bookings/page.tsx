'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { Layout } from './components/booking/Layout';
import { DateSelection } from './components/booking/steps/DateSelection';
import { TimeSlots } from './components/booking/steps/TimeSlots';
import { BookingDetails } from './components/booking/steps/BookingDetails';
import { useBookingFlow } from './hooks/useBookingFlow';

export default function BookingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession({
    required: false,
    onUnauthenticated() {
    },
  });

  const {
    currentStep,
    selectedDate,
    selectedTime,
    maxDuration,
    handleDateSelect,
    handleTimeSelect,
    handleBack,
  } = useBookingFlow();

  if (status === 'loading') {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }
  
  const renderContent = () => (
    <div className="min-h-[36rem]">
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

        {currentStep === 3 && selectedDate && selectedTime && (
          <BookingDetails
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {renderContent()}
      </div>
    </Layout>
  );
} 