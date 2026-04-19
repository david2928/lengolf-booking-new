'use client';

import { useSession } from 'next-auth/react';
import { useTranslations, useFormatter } from 'next-intl';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import dynamic from 'next/dynamic';
import { Layout } from './components/booking/Layout';
import { DateSelection } from './components/booking/steps/DateSelection';
import { useBookingFlow } from './hooks/useBookingFlow';

const TimeSlots = dynamic(
  () => import('./components/booking/steps/TimeSlots').then(mod => ({ default: mod.TimeSlots })),
  { loading: () => <div className="flex items-center justify-center min-h-[20rem]"><div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" /></div> }
);

const BookingDetails = dynamic(
  () => import('./components/booking/steps/BookingDetails').then(mod => ({ default: mod.BookingDetails })),
  { loading: () => <div className="flex items-center justify-center min-h-[20rem]"><div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" /></div> }
);

export default function BookingsPage() {
  const tCommon = useTranslations('bookings.common');
  const tPage = useTranslations('bookings.page');
  const format = useFormatter();

  const { status } = useSession({
    required: false,
    onUnauthenticated() {
    },
  });

  const {
    currentStep,
    selectedDate,
    selectedTime,
    selectedBayType,
    maxDuration,
    selectedPackage,
    selectedClubRental,
    selectedClubSetId,
    selectedSlotData,
    setSelectedClubRental,
    setSelectedClubSetId,
    handleDateSelect,
    handleTimeSelect,
    handleBack,
    getFixedPeople,
    isPackageMode,
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
            aria-label={tCommon('goBack')}
          >
            <ArrowLeftIcon className="h-6 w-6 text-gray-600" />
          </button>
        )}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {currentStep === 1
              ? tPage('stepDateTitle')
              : currentStep === 2
              ? tPage('stepTimeTitle')
              : tPage('stepDetailsTitle')
            }
          </h2>
          <p className="text-gray-600 mt-1">
            {currentStep === 1
              ? tPage('stepDateSubtitle')
              : currentStep === 2
              ? format.dateTime(selectedDate!, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
              : tPage('stepDetailsSubtitle')
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
            selectedBayType={selectedBayType}
            maxDuration={maxDuration}
            slotData={selectedSlotData}
            onBack={handleBack}
            selectedPackage={selectedPackage}
            fixedPeople={getFixedPeople()}
            isPackageMode={isPackageMode()}
            selectedClubRental={selectedClubRental}
            onClubRentalChange={setSelectedClubRental}
            selectedClubSetId={selectedClubSetId}
            onClubSetIdChange={setSelectedClubSetId}
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