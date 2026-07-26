'use client';

import { BayInfoModal } from '../../BayInfoModal';
import { BookingSummaryBar, BOOKING_SUMMARY_BAR_SPACER } from '@/components/shared/BookingSummaryBar';
import { NoAvailabilityModal } from './details/modals/NoAvailabilityModal';
import { SubmitOverlay } from './details/modals/SubmitOverlay';
import { PackageDetailsModal } from './details/modals/PackageDetailsModal';
import { ClubRentalDetailsModal } from './details/modals/ClubRentalDetailsModal';
import { SessionStep } from './details/SessionStep';
import { ExtrasStep } from './details/ExtrasStep';
import { PackageHoursCard } from './details/PackageHoursCard';
import { CreditBalanceCard } from './details/CreditBalanceCard';
import { YourDetailsStep } from './details/YourDetailsStep';
import { DetailsSubStepSummary } from './details/DetailsSubStepSummary';
import { SummaryRail } from './details/SummaryRail';
import { bayChoiceLabelKey } from './details/bayChoice';
import { buildSessionSummaryValue, summaryBarSublineFor } from './details/summarySubline';
import {
  DETAIL_SUB_STEPS,
  SUB_STEP_LABEL_KEYS,
  type DetailSubStep,
} from './details/useDetailsSubStep';
import { useBookingDetailsForm, type BookingDetailsProps } from './details/useBookingDetailsForm';
import useMediaQuery from '@/hooks/useMediaQuery';

export function BookingDetails(props: BookingDetailsProps) {
  const {
    selectedDate,
    selectedTime,
    selectedBayType,
    /* The slot's headroom already narrowed to what the chosen bay type can
       serve — see `bayTypeHeadroom`. Everything below that offers a LENGTH
       reads this, never the raw `maxDuration` prop. */
    maxBookableHours,
    onBack,
    selectedClubRental,
    onClubRentalChange,
    selectedClubSetId,
    onClubSetIdChange,
    selectedAddOns,
    onAddOnsChange,
    subStepNav,
    t,
    formatter,
    locale,
    router,
    status,
    costLanguage,
    PLAY_FOOD_PACKAGES,
    PREMIUM_CLUB_PRICING,
    PREMIUM_PLUS_CLUB_PRICING,
    duration,
    setDuration,
    phoneNumber,
    setPhoneNumber,
    email,
    setEmail,
    name,
    setName,
    numberOfPeople,
    setNumberOfPeople,
    customerNotes,
    setCustomerNotes,
    marketingOptIn,
    setMarketingOptIn,
    marketingPreference,
    isEditingContact,
    setIsEditingContact,
    alsoUpdateAccount,
    setAlsoUpdateAccount,
    localSelectedPackage,
    setLocalSelectedPackage,
    isSubmitting,
    loadingStep,
    showLoadingOverlay,
    loadingSteps,
    availableClubSets,
    clubSetsLoading,
    errors,
    errorField,
    setErrorField,
    showNoAvailabilityModal,
    setShowNoAvailabilityModal,
    showBayInfoModal,
    setShowBayInfoModal,
    showPackageModal,
    setShowPackageModal,
    showClubRentalModal,
    setShowClubRentalModal,
    hasActivePackage,
    packageCoverage,
    packageBalance,
    creditBalance,
    packageDisplayName,
    isLineUser,
    costBreakdown,
    costDataLoading,
    handleSubmit,
    handlePrimaryCta,
    formatDate,
  } = useBookingDetailsForm(props);

  const { subStep, subStepIndex, goToSubStep, isLast } = subStepNav;

  /**
   * The sticky bar must genuinely not mount above `lg:`, not merely be hidden by
   * CSS: it claims the refcounted `has-summary-bar` body class, which pads the
   * document by 7rem and lifts the chat FAB (see the rules in
   * `app/globals.css`). A `lg:hidden` wrapper would still run that effect and
   * leave desktop with bottom padding for a bar nobody can see.
   *
   * Everything else stays CSS-gated. This is the one place that needs a real
   * viewport read, and it is safe here: `BookingDetails` is a `dynamic()` import
   * reached by clicking through steps 1 and 2, so it only ever first renders on
   * the client — there is no server HTML for the `useState(false)` start value to
   * mismatch against.
   */
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Show loading state while session is being fetched
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
      </div>
    );
  }

  /* Resolved from the shared key map so the collapsed summaries here and the
     step header in `page.tsx` can never name the same sub-step differently. */
  const subStepLabels: Record<DetailSubStep, string> = {
    session: t(SUB_STEP_LABEL_KEYS.session),
    extras: t(SUB_STEP_LABEL_KEYS.extras),
    contact: t(SUB_STEP_LABEL_KEYS.contact),
  };

  /**
   * Below `lg:` only the active sub-step's panel is on screen; above `lg:` all
   * three render side by side with the summary rail — there is room, so gating
   * them would be artificial. Gating is CSS-only so the sections themselves
   * never depend on a client-side viewport measurement.
   *
   * These wrappers DO introduce an element between the `<form>` and each
   * section's blocks, which would otherwise swallow the form's
   * `space-y-4 sm:space-y-6` (a `> * + *` selector). The spacing responsibility
   * is therefore moved explicitly: each wrapper repeats the same `space-y` so
   * blocks inside it stay spaced, and the form keeps its own `space-y` to space
   * the wrappers from each other. Net rendered spacing is unchanged.
   */
  const panelClass = (s: DetailSubStep) =>
    `space-y-4 sm:space-y-6 ${subStep === s ? '' : 'hidden lg:block'}`;

  /** A completed sub-step collapses to a one-line summary — on mobile only. */
  const isCollapsed = (s: DetailSubStep) => DETAIL_SUB_STEPS.indexOf(s) < subStepIndex;

  /* One source, three states — see `bayChoiceLabelKey`. Every surface below
     that states the bay (the Session recap card, the collapsed Session summary,
     the desktop rail and the mobile review panel) reads this same value, and
     the step header in `page.tsx` resolves the same key. */
  const bayLabel = t(bayChoiceLabelKey(selectedBayType));

  const clubRentalLabel =
    selectedClubRental === 'none' ? t('noRental')
    : selectedClubRental === 'premium' ? t('premiumLabel')
    : selectedClubRental === 'premium-plus' ? t('premiumPlusLabel')
    : t('standardSet');
  const addOnCount = Object.values(selectedAddOns).filter(Boolean).length;

  /* Both the collapsed Session summary and the sticky bar's subline print the
     duration, and both used to hardcode "hr" — English inside otherwise
     translated Thai. One key, used in both places. Note these two and the
     desktop `SummaryRail` are mutually exclusive by viewport (`lg:hidden` vs
     `hidden lg:block`), so the rail's own `summaryRailHours` never shows
     alongside this. */
  const durationLabel = t('durationHoursShort', { hours: duration });
  const peopleLabel = t('peopleCountShort', { count: numberOfPeople });

  /* The facts the mobile review panel shows above the confirm action. Built
     here, from the SAME strings the collapsed sub-step summaries and the sticky
     bar's subline already print, so the panel cannot describe the booking
     differently from the rest of step 3.

     Desktop ignores this: `SummaryRail` carries the same five facts in its own
     column — but note "the same facts", not the same strings. Date, time, bay
     and the party size render identically; DURATION deliberately does not. The
     rail prints `summaryRailHours` ("2 hr") and the panel prints
     `durationHoursShort` ("2 hrs", ICU plural), because the panel's neighbour
     is not the rail. The rail and the panel are mutually exclusive by viewport
     and never share a screen; the panel and the sticky bar DO, about 100px
     apart, and the bar prints `durationHoursShort`. Matching the rail here
     would buy agreement with a component the customer cannot see at the cost of
     disagreement with one they can.

     `numberOfPeople` goes in as a bare number, matching the rail: `peopleLabel`
     carries its own unit for the collapsed summary, where there is no label to
     supply one, and under the panel's "People" label it read "People / 3
     people". */
  const reviewFacts = {
    selectedDate,
    selectedTime,
    durationLabel,
    numberOfPeople,
    bayLabel,
    formatDate,
  };

  return (
    /* `lg:pb-0` drops the bar's spacer above `lg:`, where no bar mounts. */
    <div className={`space-y-4 sm:space-y-6 ${BOOKING_SUMMARY_BAR_SPACER} lg:pb-0`}>
      {/* No sub-step progress row here. It printed "DETAILS · 1 OF 3" beside
          the sub-step name, in its own row, under a step header that was
          already naming the step — so the same fact was on screen twice before
          the first control.

          The step header in `page.tsx` now carries the whole of it: the current
          sub-step is named by being ASKED ("How long?" as the heading), and the
          position row above that counts top-level steps. What is deliberately
          gone is the sub-step COUNTER — "1 of 3" within step 3. The collapsed
          summaries below already show which sub-steps are behind the customer,
          which is the part of that counter they were reading.

          `subStepLabels` stays: those collapsed summaries still name their
          sub-step. */}

      {/* One column below `lg:`, form + sticky summary rail above it. */}
      <div className="grid gap-6 items-start lg:grid-cols-[1fr_296px]">
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 bg-white rounded-xl shadow-sm p-3 sm:p-6">
          {isCollapsed('session') && (
            <div className="lg:hidden">
              <DetailsSubStepSummary
                label={subStepLabels.session}
                /* Duration and party size only. The BAY is deliberately absent:
                   the step header's subline three rows above already names it,
                   and it is chosen on the time step, not here — see
                   `buildSessionSummaryValue` for the full rule and for why this
                   row is the wrong place to state a value its own "Change"
                   cannot reach. */
                value={buildSessionSummaryValue({ durationLabel, peopleLabel })}
                changeLabel={t('changeAction')}
                onChange={() => goToSubStep('session')}
              />
            </div>
          )}
          <div className={panelClass('session')}>
            <SessionStep
              maxDuration={maxBookableHours}
              duration={duration}
              setDuration={setDuration}
              numberOfPeople={numberOfPeople}
              setNumberOfPeople={setNumberOfPeople}
              localSelectedPackage={localSelectedPackage}
              setLocalSelectedPackage={setLocalSelectedPackage}
              PLAY_FOOD_PACKAGES={PLAY_FOOD_PACKAGES}
              setShowPackageModal={setShowPackageModal}
              router={router}
              durationError={errors.duration}
              hasActivePackage={hasActivePackage}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              selectedBayType={selectedBayType}
              bayLabel={bayLabel}
              locale={locale}
              setShowBayInfoModal={setShowBayInfoModal}
              onBack={onBack}
            />
          </div>
  
          {isCollapsed('extras') && (
            <div className="lg:hidden">
              <DetailsSubStepSummary
                label={subStepLabels.extras}
                value={addOnCount > 0 ? `${clubRentalLabel} · +${addOnCount}` : clubRentalLabel}
                changeLabel={t('changeAction')}
                onChange={() => goToSubStep('extras')}
              />
            </div>
          )}
          <div className={panelClass('extras')}>
            {/* Remaining package hours, plus the partial-coverage warning when
                the balance will not stretch across the booking. Rendered as a
                sibling of `ExtrasStep` (which is a fragment) so the panel's
                `space-y` still spaces it, and so `ExtrasStep`'s prop surface —
                covered by its own tests — stays untouched. `packageCoverage` is
                null whenever no card should show, including Play & Food mode. */}
            {packageCoverage && (
              <PackageHoursCard
                coverage={packageCoverage}
                packageDisplayName={packageDisplayName}
                totalHours={packageBalance.totalHours}
                usedHours={packageBalance.usedHours}
                expiryDate={packageBalance.expiryDate}
                formatter={formatter}
              />
            )}
            {/* Free-hour credits the customer already holds — the B1G1 hour a
                previous sub-2-hour booking earned them. Renders NOTHING at a
                zero balance (and while the fetch is in flight), which is the
                overwhelmingly common case: it must never appear as an empty
                "0 hours" card. Read-only and outside the estimate — the card's
                own copy says so. Sits beside the package card because both
                answer "what do I already have?" before the extras that add to
                the bill. */}
            <CreditBalanceCard credits={creditBalance} formatter={formatter} />
            <ExtrasStep
              selectedClubRental={selectedClubRental}
              onClubRentalChange={onClubRentalChange}
              selectedClubSetId={selectedClubSetId}
              onClubSetIdChange={onClubSetIdChange}
              setShowClubRentalModal={setShowClubRentalModal}
              clubSetsLoading={clubSetsLoading}
              availableClubSets={availableClubSets}
              duration={duration}
              selectedAddOns={selectedAddOns}
              onAddOnsChange={onAddOnsChange}
              formatter={formatter}
            />
          </div>
  
          {/* `contact` is the last sub-step, so it never collapses to a summary. */}
          <div className={panelClass('contact')}>
            <YourDetailsStep
              name={name}
              setName={setName}
              phoneNumber={phoneNumber}
              setPhoneNumber={setPhoneNumber}
              email={email}
              setEmail={setEmail}
              errorField={errorField}
              setErrorField={setErrorField}
              phoneNumberError={errors.phoneNumber}
              emailError={errors.email}
              isLineUser={isLineUser}
              customerNotes={customerNotes}
              setCustomerNotes={setCustomerNotes}
              costBreakdown={costBreakdown}
              costDataLoading={costDataLoading}
              costLanguage={costLanguage}
              review={reviewFacts}
              isSubmitting={isSubmitting}
              marketingOptIn={marketingOptIn}
              marketingPreference={marketingPreference}
              setMarketingOptIn={setMarketingOptIn}
              isEditingContact={isEditingContact}
              onEditContact={() => setIsEditingContact(true)}
              alsoUpdateAccount={alsoUpdateAccount}
              setAlsoUpdateAccount={setAlsoUpdateAccount}
            />
          </div>
        </form>

        {/* Desktop only. `hidden lg:block` keeps it out of the mobile DOM's
            reading order (and out of the a11y tree) rather than stacking a
            second total under the form. */}
        <aside className="hidden lg:block lg:sticky lg:top-6">
          <SummaryRail
            costBreakdown={costBreakdown}
            costDataLoading={costDataLoading}
            costLanguage={costLanguage}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            duration={duration}
            numberOfPeople={numberOfPeople}
            bayLabel={bayLabel}
            ctaLabel={isSubmitting ? t('processing') : t('confirmBooking')}
            /* Desktop shows every section at once, so the rail always confirms
               rather than advancing a sub-step — same validation path. */
            onCta={() => handlePrimaryCta({ submitNow: true })}
            ctaLoading={isSubmitting}
            formatDate={formatDate}
          />
        </aside>
      </div>

      {/* Mobile only, and genuinely unmounted above `lg:` — see the `isDesktop`
          note above for why CSS hiding alone is not enough here. The `lg:hidden`
          wrapper is not redundant: `useMediaQuery` starts at `false` and only
          resolves in an effect, so it covers the single desktop frame between
          first paint and that resolution. */}
      {!isDesktop && (
        <div className="lg:hidden">
          <BookingSummaryBar
            total={costBreakdown ? costBreakdown.estimatedTotal : null}
            totalLabel={t('summaryTotalLabel')}
            /* Date FIRST — see `buildSummaryBarSubline` for why the ordering
               is load-bearing against the bar's `truncate`. The composer both
               formats the date and orders the segments, so the wiring is one
               tested unit and a `Date` cannot land in the start-time slot. */
            subline={summaryBarSublineFor({
              locale,
              date: selectedDate,
              durationLabel,
              time: selectedTime,
            })}
            ctaLabel={
              !isLast
                ? t('ctaContinue')
                : isSubmitting
                ? t('processing')
                : t('confirmBooking')
            }
            onCta={() => handlePrimaryCta()}
            ctaLoading={isSubmitting}
            emptyPrompt={t('summaryEmptyPrompt')}
          />
        </div>
      )}

      {/* No Availability Modal */}
      <NoAvailabilityModal
        isOpen={showNoAvailabilityModal}
        onClose={() => setShowNoAvailabilityModal(false)}
        onBack={onBack}
      />

      {/* Add the loading overlay */}
      <SubmitOverlay
        isOpen={showLoadingOverlay}
        steps={loadingSteps}
        currentStep={loadingStep}
      />

      {/* Package Details Modal */}
      <PackageDetailsModal
        isOpen={showPackageModal}
        onClose={() => setShowPackageModal(false)}
        packages={PLAY_FOOD_PACKAGES}
        maxDuration={maxBookableHours}
        onSelectPackage={(pkg) => {
          setLocalSelectedPackage(pkg);
          setDuration(pkg.duration);
          const newUrl = `/bookings?package=${pkg.id}`;
          router.replace(newUrl, { scroll: false });
          setShowPackageModal(false);
        }}
        onContinueWithoutPackage={() => {
          setLocalSelectedPackage(null);
          setDuration(1);
          setNumberOfPeople(1);
          router.replace('/bookings', { scroll: false });
          setShowPackageModal(false);
        }}
      />

      {/* Golf Club Rental Details Modal */}
      <ClubRentalDetailsModal
        isOpen={showClubRentalModal}
        onClose={() => setShowClubRentalModal(false)}
        premiumPricing={PREMIUM_CLUB_PRICING}
        premiumPlusPricing={PREMIUM_PLUS_CLUB_PRICING}
      />

      {/* Bay Information Modal */}
      <BayInfoModal
        isOpen={showBayInfoModal}
        onClose={() => setShowBayInfoModal(false)}
      />
    </div>
  );
}
