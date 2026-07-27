'use client';

import { useSession } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import dynamic from 'next/dynamic';
import { Layout } from './components/booking/Layout';
import { BookingStepHeader } from './components/booking/BookingStepHeader';
import {
  BAY_BOOKING_SCREEN_COUNT,
  BAY_BOOKING_STEP_COUNT,
  SUB_STEP_QUESTION_KEYS,
  narrowStepFor,
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
    duration,
    setDuration,
    numberOfPeople,
    setNumberOfPeople,
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
      <Layout hidePromotionBar compactHeader flushMain hideFooter={currentStep > 1} hideNav={currentStep > 1}>
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

  /**
   * Where the customer is in the FIVE screens a phone walks: date, time, then
   * one screen per step-3 sub-step. Below `lg:` this is the honest count, and
   * the bug it fixes was showing "Step 3 of 3" with a full bar to someone on
   * the third of five.
   *
   * The GA4 funnel is untouched by this: `BAY_BOOKING_STEPS` still reports
   * `date`/`time`/`details`, and nothing here reads or writes it. The wide model
   * below keeps printing that same three, because above `lg:` step 3 really is
   * one screen.
   */
  const narrowStep = narrowStepFor(currentStep, detailsSubStep.subStepIndex);

  const renderContent = () => (
    <div className="min-h-[36rem]">
      {/* In-flow step header. The layout lives in `BookingStepHeader`; what is
          decided here is WHICH strings it gets, because every one of those
          choices depends on flow state this component holds and that one does
          not.

          Four of them are worth naming:

          - The PROGRESS is two models, and they are both display. Below `lg:`
            the customer walks five screens, so the bars and the position count
            five; above it step 3 renders whole and they count three. Neither
            number is `BAY_BOOKING_STEPS.length` and neither may become it: the
            funnel keeps reporting three stages so the GA4 series stays
            comparable with its own history. What the customer is TOLD and what
            we MEASURE are allowed to differ, and here they must.
          - The QUESTION at step 3 is the current SUB-step's, not the step's.
            "Details" describes a screen; "How long?" asks for something, and a
            customer who has reached step 3 needs the second. `questionWide`
            covers the case the sub-step question cannot: above `lg:` all three
            sub-steps render at once, so no single one of their questions is
            true and the step-level question stands in.
          - The SUBLINE accumulates. Step 1 passes nothing (nothing has been
            chosen), step 2 passes the date, step 3 adds the start time and the
            bay. `stepHeaderSublineFor` drops whatever is null, so this is one
            expression rather than a branch per step. It is now unconditional:
            it used to fall silent on the session sub-step, where a slot chip
            restated the same three facts, and that chip is gone. The subline is
            the only place the flow states them, on every screen that has one.
          - CHANGE SLOT is passed on step 3 only, and it calls `handleBack` —
            the STEP-level back, which lands on step 2 where the start time and
            the bay were chosen. This is what the deleted chip's "Change" did,
            moved onto the line that already states the facts. Steps 1 and 2 do
            not get it: their own back arrow already reaches the step their
            subline describes, so a second control would be a second way to do
            the same thing. On step 3 it is not the same thing, which is the
            whole point — see the next bullet.
          - The BACK control is `handleHeaderBack`, not `handleBack`: inside
            step 3 backward means the previous sub-step, and only from the first
            sub-step does it mean the previous step. Passing `undefined` on step
            1 is what removes the control, since there is nowhere to go.

            That difference is exactly why Change earns its place: from the
            extras and contact sub-steps the arrow walks backwards one sub-step
            at a time, so the slot the subline is describing takes two or three
            presses and a guess to reach. Change is one press from all three,
            and it always means the same thing, while the arrow's destination
            changes underneath the customer as they advance. */}
      <BookingStepHeader
        currentStep={narrowStep}
        totalSteps={BAY_BOOKING_SCREEN_COUNT}
        label={tPage(stepLabelKey(currentStep))}
        position={tPage('stepPosition', {
          current: narrowStep,
          total: BAY_BOOKING_SCREEN_COUNT,
        })}
        currentStepWide={currentStep}
        totalStepsWide={BAY_BOOKING_STEP_COUNT}
        positionWide={tPage('stepPosition', {
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
        onChangeSlot={currentStep === BAY_BOOKING_STEP_COUNT ? handleBack : undefined}
        changeSlotLabel={tDetails('changeAction')}
        changeSlotAriaLabel={tDetails('changeSlotAction')}
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
            /* Controlled by the flow, not by `BookingDetails`: step 3 unmounts
               whenever the customer steps back to change their slot, so a
               component-local duration or party size would be reset by the very
               navigation the session chip's "Change" advertises. */
            duration={duration}
            onDurationChange={setDuration}
            numberOfPeople={numberOfPeople}
            onNumberOfPeopleChange={setNumberOfPeople}
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
       - `hideFooter`        TAKEN FROM STEP 2 ONWARD, not on step 1.

         It was taken unconditionally on the argument that the long marketing
         footer belongs on a landing page and not under a checkout. Half of that
         is right, and the half it got wrong is the half this page is: step 1 IS
         the landing surface — it is what `/` serves and what every ad and every
         link into this app arrives on. Suppressing the footer there took the
         address, the opening hours and the social links off the one screen
         whose reader may still be deciding whether to come at all. Owner: "the
         footer should still be there on the main landing page".

         So the rule is now the one the original argument actually described:
         landing gets the footer, checkout does not. Step 1 is landing; from
         step 2 the customer has committed to a date and everything below the
         fold is a distraction under a form.

         The footer sits at the very bottom, past the sticky total bar, so it
         changes only what is under the fold and never the chrome the customer
         is looking at — which is why this was the first prop to go
         step-conditional and the cheapest one to. `hideNav` followed for the
         same landing-vs-checkout reason; see it below for the cost that one
         does carry. The loading branch takes this same expression rather than a
         bare `hideFooter`, so the two cannot disagree the moment the session
         resolves.
       - `hideNav`           TAKEN FROM STEP 2 ONWARD, not on step 1. Same rule
         as `hideFooter`, and for the same reason.

         It strips the desktop Bay Rates / Promotions / Lessons / Club Rental /
         Play & Food links, leaving the wordmark and the badge — the header the
         mockup draws. It was taken unconditionally to match that mockup, over
         the objection that step 1 doubles as this app's landing surface, on the
         grounds that nothing was removed and only demoted: every link is still
         in the burger menu, which `hideNav` does not touch and which is the
         only place a phone ever had them.

         That reasoning holds for a customer mid-checkout and fails for the one
         who just arrived. Owner: "what happened to the desktop header, all the
         links are gone". A visitor landing on step 1 from an ad has not chosen
         to book yet, and "it is in the burger menu" is a poor answer on a
         1385px desktop where a burger menu is not where anyone looks. The
         mockup draws the CHECKOUT header; it was never a claim about the
         landing screen.

         So this is now the second step-conditional prop, and it does cost
         something the footer does not: the desktop header genuinely
         restructures at the 1→2 transition. Accepted, because stripping nav on
         entering a checkout is a conventional, legible move rather than a
         glitch — and because it is desktop-only. Below `lg` the links live in
         the burger either way, so a phone sees no change at all, which is where
         chrome flicker would actually be felt.

         Both branches take the same expression, so the loading placeholder and
         the real return cannot disagree the moment the session resolves. */
    <Layout hidePromotionBar compactHeader flushMain hideFooter={currentStep > 1} hideNav={currentStep > 1}>
      {/* `container mx-auto px-4 sm:px-6 lg:px-8`, and it must stay that exact
          string: it is what Layout's own <main> applied before `flushMain`
          moved padding ownership here, and it is what `Header` and the sticky
          `BookingSummaryBar` still apply to THEIR inner wrappers.

          This was `max-w-7xl mx-auto`, which is not the same thing and made the
          content column disagree with the chrome above and below it. Tailwind's
          `container` steps its max-width down to the breakpoint (640/768/1024/
          1280/1300/1536); `max-w-7xl` is a flat 1280 cap, so between 640px and
          1280px it does not constrain at all. Measured at an 854px content box:
          the header's wordmark sat 67px in and the step header 24px in, a 43px
          stagger, with the form card wider than the bar of chrome it hung
          under. At 1280 and below 640 the two were already identical, which is
          why it survived a desktop and a phone check. */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {renderContent()}
      </div>
    </Layout>
  );
} 