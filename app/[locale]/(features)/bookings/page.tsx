'use client';

import { useSession } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import dynamic from 'next/dynamic';
import { Layout } from './components/booking/Layout';
import { BookingStepHeader } from './components/booking/BookingStepHeader';
import {
  BAY_BOOKING_STEP_COUNT,
  SUB_STEP_QUESTION_KEYS,
  stepHeaderSublineFor,
  stepLabelKey,
  stepQuestionKey,
} from './components/booking/stepHeaderModel';
import { DateSelection } from './components/booking/steps/DateSelection';
import { bayChoiceLabelKey } from './components/booking/steps/details/bayChoice';
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
  /* Step 3's header asks its current sub-step's question and names the bay, and
     both of those strings live with the rest of step 3 rather than under
     `bookings.page`. */
  const tDetails = useTranslations('bookings.detailsStep');
  /* Not derived from the URL prefix: English is unprefixed under
     `localePrefix: 'as-needed'`, so a path read would report the wrong locale on
     every English page. The header's subline needs it for both the separator
     and the short-date form. */
  const locale = useLocale();

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
    handleBayTypeSelect,
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
      <Layout hidePromotionBar compactHeader flushMain hideFooter hideNav>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }
  
  /**
   * The bay, for the header's subline.
   *
   * By step 3 this is ALWAYS known: step 2's bay control is the choice, and its
   * three answers are Social, AI Lab and "All Bays" — the last meaning no
   * preference, which is why it names itself rather than going unsaid. There is
   * no longer a state where the bay is pending, so there is no longer a reason
   * for the subline to fall silent about it; the header prints the same string
   * `BookingDetails` puts on the recap card, the rail and the review panel.
   *
   * Null before step 3 only, where the subline is still accumulating and the
   * customer has not reached the bay yet.
   */
  const bayChoiceLabel = currentStep === 3 ? tDetails(bayChoiceLabelKey(selectedBayType)) : null;

  const renderContent = () => (
    <div className="min-h-[36rem]">
      {/* In-flow step header. The layout lives in `BookingStepHeader`; what is
          decided here is WHICH strings it gets, because every one of those
          choices depends on flow state this component holds and that one does
          not.

          Three of them are worth naming:

          - The QUESTION at step 3 is the current SUB-step's, not the step's.
            "Details" describes a screen; "How long?" asks for something, and a
            customer who has reached step 3 needs the second. `questionWide`
            covers the case the sub-step question cannot: above `lg:` all three
            sub-steps render at once, so no single one of their questions is
            true and the step-level question stands in.
          - The SUBLINE accumulates. Step 1 passes nothing (nothing has been
            chosen), step 2 passes the date, step 3 adds the start time and the
            bay. `stepHeaderSublineFor` drops whatever is null, so this is one
            expression rather than a branch per step.
          - The BACK control is `handleHeaderBack`, not `handleBack`: inside
            step 3 backward means the previous sub-step, and only from the first
            sub-step does it mean the previous step. Passing `undefined` on step
            1 is what removes the control, since there is nowhere to go. */}
      <BookingStepHeader
        currentStep={currentStep}
        label={tPage(stepLabelKey(currentStep))}
        position={tPage('stepPosition', {
          current: currentStep,
          total: BAY_BOOKING_STEP_COUNT,
        })}
        question={
          currentStep === 3
            ? tDetails(SUB_STEP_QUESTION_KEYS[detailsSubStep.subStep])
            : tPage(stepQuestionKey(currentStep))
        }
        questionWide={currentStep === 3 ? tPage('stepDetailsQuestion') : undefined}
        subline={stepHeaderSublineFor({
          locale,
          date: currentStep >= 2 ? selectedDate : null,
          fromTimeLabel:
            currentStep === 3 && selectedTime
              ? tPage('sublineFromTime', { time: selectedTime })
              : null,
          bayLabel: bayChoiceLabel,
        })}
        onBack={currentStep > 1 ? handleHeaderBack : undefined}
        backLabel={tCommon('goBack')}
      />

      <div className="relative">
        {currentStep === 1 && (
          <DateSelection onDateSelect={handleDateSelect} />
        )}

        {currentStep === 2 && selectedDate && (
          <TimeSlots
            selectedDate={selectedDate}
            /* Controlled by the flow, not by `TimeSlots` itself: step 2
               unmounts on the way to step 3 and remounts on the way back, so a
               component-local choice would be lost each time. */
            bayType={selectedBayType}
            onBayTypeChange={handleBayTypeSelect}
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
       - `hideNav`           TAKEN. It strips the desktop Bay Rates /
         Promotions / Lessons / Club Rental / Play & Food links, leaving the
         wordmark and the badge — which is the header the mockup draws.

         This was previously NOT taken, on the argument that `/bookings` step 1
         doubles as this app's landing surface and a customer there may still
         be browsing rather than committed. The mockup settles it the other
         way, and the argument was weaker than it looked: nothing is removed,
         only demoted. Every one of those links is still in the burger menu,
         which `hideNav` does not touch and which is the ONLY place a phone
         ever had them — so what the mockup asks for is what the majority of
         customers were already being given.

         Taken unconditionally rather than from step 2 onward, deliberately: a
         step-conditional nav would restructure the header as the customer
         advances, which is the same chrome flicker the loading-state props
         above exist to prevent. */
    <Layout hidePromotionBar compactHeader flushMain hideFooter hideNav>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {renderContent()}
      </div>
    </Layout>
  );
} 