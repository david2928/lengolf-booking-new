'use client';

import { useSession } from 'next-auth/react';
import { useTranslations, useFormatter } from 'next-intl';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import dynamic from 'next/dynamic';
import { Layout } from './components/booking/Layout';
import { DateSelection } from './components/booking/steps/DateSelection';
import {
  DETAIL_SUB_STEPS,
  SUB_STEP_LABEL_KEYS,
} from './components/booking/steps/details/useDetailsSubStep';
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
  /* The step-3 header names the current sub-step, whose strings live with the
     rest of step 3 rather than under `bookings.page`. */
  const tDetails = useTranslations('bookings.detailsStep');
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
      {/* In-flow step header. Every row here is charged against the first
          screen: the sticky site header already spends 56px above it, and on a
          phone the two together used to eat the viewport before any content.

          Three deliberate reductions:

          - `text-xl` below `sm:`. The heading is the only 24px type on the
            page and it does not need to be, in a flow the customer has already
            committed to by reaching it. Desktop keeps `text-2xl`.
          - Step 3 has NO subtitle. `stepDetailsSubtitle` read "Complete your
            booking details." under a heading reading "Provide Details" — a
            restatement occupying a full row, so the key is gone. Steps 1 and 2
            keep theirs, because they say something the title does not (step 2's
            is the selected date).
          - The sub-step indicator moved ONTO this row from its own row inside
            `BookingDetails`, where it sat as `DETAILS · 1 OF 3` plus the
            sub-step name — two rows saying related things. Its information is
            unchanged, only its separateness is gone: the whole line, name and
            position, is now `subStepHeaderLine` at the end of the title row.
            `flex-wrap` is the fallback for a locale where both do not fit on
            one line; it wraps rather than truncating the heading.

          `lg:hidden` on the indicator matches the row it replaced — above `lg:`
          all three sub-steps are on screen at once, so a counter would be
          describing nothing. */}
      <div className="mb-4 sm:mb-6 flex items-start gap-2">
        {currentStep > 1 && (
          /* `-ml-2` pulls the button's padding box off the content edge so the
             arrow itself lines up with the heading's left edge. The 40px tap
             target and the `aria-label` are unchanged. */
          <button
            onClick={handleHeaderBack}
            className="-ml-2 shrink-0 p-2 rounded-lg hover:bg-gray-100"
            aria-label={tCommon('goBack')}
          >
            <ArrowLeftIcon className="h-6 w-6 text-gray-600" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="text-xl sm:text-2xl font-bold leading-tight text-gray-900">
              {currentStep === 1
                ? tPage('stepDateTitle')
                : currentStep === 2
                ? tPage('stepTimeTitle')
                : tPage('stepDetailsTitle')
              }
            </h2>
            {currentStep === 3 && (
              <p className="text-xs font-medium text-gray-500 tabular-nums lg:hidden">
                {tDetails('subStepHeaderLine', {
                  label: tDetails(SUB_STEP_LABEL_KEYS[detailsSubStep.subStep]),
                  current: detailsSubStep.subStepIndex + 1,
                  total: DETAIL_SUB_STEPS.length,
                })}
              </p>
            )}
          </div>
          {currentStep !== 3 && (
            /* Supporting text under the heading, a size below it so it does not
               compete for the eye. */
            <p className="mt-0.5 text-xs sm:text-sm text-gray-600">
              {currentStep === 1
                ? tPage('stepDateSubtitle')
                : format.dateTime(selectedDate!, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
              }
            </p>
          )}
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