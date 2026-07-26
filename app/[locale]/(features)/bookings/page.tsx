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
    selectedAddOns,
    selectedSlotData,
    setSelectedClubRental,
    setSelectedClubSetId,
    setSelectedAddOns,
    handleDateSelect,
    handleTimeSelect,
    handleBack,
    handleHeaderBack,
    detailsSubStep,
    getFixedPeople,
    isPackageMode,
  } = useBookingFlow();

  // Session-loading placeholder. It carries the SAME Layout props as the real
  // return below: any difference here shows up as chrome appearing or
  // disappearing the moment the session resolves, which reads as a flash of a
  // different page rather than a load.
  if (status === 'loading') {
    return (
      <Layout hidePromotionBar compactHeader flushMain hideFooter>
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
            onClick={handleHeaderBack}
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
          {/* `text-sm`: the subtitle is supporting text under a `text-2xl`
              heading, and at the default body size it competed with the h2 for
              the eye. Matches the course-rental step header exactly. */}
          <p className="text-gray-600 mt-1 text-sm">
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
            selectedAddOns={selectedAddOns}
            onAddOnsChange={setSelectedAddOns}
            subStepNav={detailsSubStep}
          />
        )}
      </div>
    </div>
  );

  return (
    /* Chrome treatment, matched to the course-rental flow. Each prop is a
       deliberate pick, not a copied set:

       - `hidePromotionBar`  TAKEN. The new-customer promo banner only renders
         once `hasBookings` resolves to false, so it drops in asynchronously
         and shoves the steps down mid-interaction. Marketing inside a checkout.
       - `compactHeader`     TAKEN. Slimmer header on mobile only (desktop is
         unchanged), which is free vertical space in a flow that also spends a
         fixed strip at the bottom on the sticky total bar.
       - `flushMain`         TAKEN. Layout's default <main> adds its own
         `container mx-auto px-4 sm:px-6 lg:px-8 py-8` around the wrapper
         below, so horizontal padding was being applied twice. The page now
         owns its padding outright.
       - `hideFooter`        TAKEN. See the commit that added it: the long
         marketing footer belongs on a landing page, not under a checkout.
       - `hideNav`           NOT TAKEN. It strips the desktop Bay Rates /
         Promotions / Lessons / club-rental links. Unlike course rental, which
         is a self-contained product flow, `/bookings` step 1 IS this app's
         landing surface (the header badge even links back to it) and a
         customer on it may legitimately be browsing rather than committed.
         Making it step-conditional would trade that for a header that
         restructures itself as the customer advances — the same chrome flicker
         the loading-state props above exist to prevent. Mobile is unaffected
         either way: those links live in the burger menu, which `hideNav`
         does not touch. */
    <Layout hidePromotionBar compactHeader flushMain hideFooter>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {renderContent()}
      </div>
    </Layout>
  );
} 