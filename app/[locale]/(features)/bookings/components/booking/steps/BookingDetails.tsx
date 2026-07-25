'use client';

import { BayInfoModal } from '../../BayInfoModal';
import { BookingSummaryBar, BOOKING_SUMMARY_BAR_SPACER } from '@/components/shared/BookingSummaryBar';
import { NoAvailabilityModal } from './details/modals/NoAvailabilityModal';
import { SubmitOverlay } from './details/modals/SubmitOverlay';
import { PackageDetailsModal } from './details/modals/PackageDetailsModal';
import { ClubRentalDetailsModal } from './details/modals/ClubRentalDetailsModal';
import { SessionStep } from './details/SessionStep';
import { ExtrasStep } from './details/ExtrasStep';
import { YourDetailsStep } from './details/YourDetailsStep';
import { DetailsSubStepSummary } from './details/DetailsSubStepSummary';
import { SummaryRail } from './details/SummaryRail';
import { DETAIL_SUB_STEPS, type DetailSubStep } from './details/useDetailsSubStep';
import { useBookingDetailsForm, type BookingDetailsProps } from './details/useBookingDetailsForm';
import useMediaQuery from '@/hooks/useMediaQuery';

export function BookingDetails(props: BookingDetailsProps) {
  const {
    selectedDate,
    selectedTime,
    selectedBayType,
    maxDuration,
    slotData,
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
    router,
    status,
    costLanguage,
    PLAY_FOOD_PACKAGES,
    PREMIUM_CLUB_PRICING,
    PREMIUM_PLUS_CLUB_PRICING,
    duration,
    setDuration,
    selectedBay,
    setSelectedBay,
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
    currentAvailability,
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

  const subStepLabels: Record<DetailSubStep, string> = {
    session: t('subStepSession'),
    extras: t('subStepExtras'),
    contact: t('subStepContact'),
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

  const bayLabel = (selectedBayType === 'ai_lab' || selectedBay === 'ai_lab')
    ? t('aiLab')
    : t('socialBay');

  const clubRentalLabel =
    selectedClubRental === 'none' ? t('noRental')
    : selectedClubRental === 'premium' ? t('premiumLabel')
    : selectedClubRental === 'premium-plus' ? t('premiumPlusLabel')
    : t('standardSet');
  const addOnCount = Object.values(selectedAddOns).filter(Boolean).length;

  return (
    /* `lg:pb-0` drops the bar's spacer above `lg:`, where no bar mounts. */
    <div className={`space-y-4 sm:space-y-6 ${BOOKING_SUMMARY_BAR_SPACER} lg:pb-0`}>
      {/* Sub-step progress. Mobile only: on desktop every sub-step is on screen
          at once, so a "1 of 3" counter would be describing nothing. */}
      <div className="flex items-baseline justify-between lg:hidden">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {t('subStepProgress', { current: subStepIndex + 1, total: DETAIL_SUB_STEPS.length })}
        </p>
        <p className="text-sm font-semibold text-gray-900">{subStepLabels[subStep]}</p>
      </div>

      {/* One column below `lg:`, form + sticky summary rail above it. */}
      <div className="grid gap-6 items-start lg:grid-cols-[1fr_296px]">
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 bg-white rounded-xl shadow-sm p-3 sm:p-6">
          {isCollapsed('session') && (
            <div className="lg:hidden">
              <DetailsSubStepSummary
                label={subStepLabels.session}
                value={`${duration} hr · ${bayLabel} · ${numberOfPeople}`}
                changeLabel={t('changeAction')}
                onChange={() => goToSubStep('session')}
              />
            </div>
          )}
          <div className={panelClass('session')}>
            <SessionStep
              maxDuration={maxDuration}
              slotData={slotData}
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
              currentAvailability={currentAvailability}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              selectedBayType={selectedBayType}
              selectedBay={selectedBay}
              setSelectedBay={setSelectedBay}
              setShowBayInfoModal={setShowBayInfoModal}
              formatDate={formatDate}
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
              isSubmitting={isSubmitting}
              marketingOptIn={marketingOptIn}
              setMarketingOptIn={setMarketingOptIn}
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
            subline={`${duration} hr · ${selectedTime}`}
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
        maxDuration={maxDuration}
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
