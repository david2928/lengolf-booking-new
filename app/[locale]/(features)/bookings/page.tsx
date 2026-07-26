'use client';

import { useSession } from 'next-auth/react';
import { useTranslations, useFormatter, useLocale } from 'next-intl';
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
  const format = useFormatter();
  /* Not derived from the URL prefix: English is unprefixed under
     `localePrefix: 'as-needed'`, so a path read would report the wrong locale on
     every English page. Only the header's subline separator needs it. */
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
  
  /**
   * The bay, for the header's subline — and null unless it is genuinely a
   * SETTLED choice, which is narrower than "we have a value".
   *
   * `selectedBayType` is set only when step 2's bay filter was on Social or AI
   * Lab; on the default "All bays" filter `TimeSlots` passes `undefined` and the
   * customer picks the bay inside step 3's Session sub-step instead. Exactly
   * that distinction is what `SessionStep` branches on: a set `selectedBayType`
   * renders read-only, an unset one renders the picker.
   *
   * So printing it only when it is set gives two things at once. The subline
   * stays true to what it claims to be — choices carried in from EARLIER steps,
   * not the one being made right now. And the header can never contradict the
   * form, because the only case where the form could still change the bay is
   * the case where the header says nothing about it.
   */
  const settledBayLabel =
    currentStep === 3 && selectedBayType
      ? selectedBayType === 'ai_lab'
        ? tDetails('aiLab')
        : tDetails('socialBay')
      : null;

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
          formatter: format,
          locale,
          date: currentStep >= 2 ? selectedDate : null,
          fromTimeLabel:
            currentStep === 3 && selectedTime
              ? tPage('sublineFromTime', { time: selectedTime })
              : null,
          bayLabel: settledBayLabel,
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