'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { th, enUS } from 'date-fns/locale';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { Layout } from './components/booking/Layout';
import { DateSelection } from './components/booking/steps/DateSelection';
import { TimeSlots } from './components/booking/steps/TimeSlots';
import { BookingDetails } from './components/booking/steps/BookingDetails';
import { useBookingFlow } from './hooks/useBookingFlow';
import { useTranslations } from 'next-intl';
import { useI18nRouter } from '@/lib/i18n/navigation';

function BookingsPageContent() {
  const t = useTranslations('booking');
  const tCommon = useTranslations('common');
  const { getCurrentLocale } = useI18nRouter();
  const router = useRouter();
  const searchParams = useSearchParams();
  
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
    selectedPackage,
    selectedClubRental,
    setSelectedClubRental,
    handleDateSelect,
    handleTimeSelect,
    handleBack,
    getMaxDuration,
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
            aria-label="Go back"
          >
            <ArrowLeftIcon className="h-6 w-6 text-gray-600" />
          </button>
        )}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {currentStep === 1 
              ? t('selectDate')
              : currentStep === 2
              ? t('selectTime')
              : t('provideDetails')
            }
          </h2>
          <p className="text-gray-600 mt-1">
            {currentStep === 1 
              ? t('chooseDatePrompt')
              : currentStep === 2
              ? (() => {
                  const locale = getCurrentLocale();
                  const dateLocale = locale === 'th' ? th : enUS;
                  return format(selectedDate!, 'EEE, d MMM yyyy', { locale: dateLocale });
                })()
              : t('completeDetailsPrompt')
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
            selectedPackage={selectedPackage}
            fixedPeople={getFixedPeople()}
            isPackageMode={isPackageMode()}
            selectedClubRental={selectedClubRental}
            onClubRentalChange={setSelectedClubRental}
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

export default function BookingsPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      </Layout>
    }>
      <BookingsPageContent />
    </Suspense>
  );
} 