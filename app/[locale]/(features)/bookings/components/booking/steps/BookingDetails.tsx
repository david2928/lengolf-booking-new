'use client';

import {
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  ComputerDesktopIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { BayInfoModal } from '../../BayInfoModal';
import { BookingSummaryBar, BOOKING_SUMMARY_BAR_SPACER } from '@/components/shared/BookingSummaryBar';
import { NoAvailabilityModal } from './details/modals/NoAvailabilityModal';
import { SubmitOverlay } from './details/modals/SubmitOverlay';
import { PackageDetailsModal } from './details/modals/PackageDetailsModal';
import { ClubRentalDetailsModal } from './details/modals/ClubRentalDetailsModal';
import { SessionStep } from './details/SessionStep';
import { ExtrasStep } from './details/ExtrasStep';
import { YourDetailsStep } from './details/YourDetailsStep';
import { useBookingDetailsForm, type BookingDetailsProps } from './details/useBookingDetailsForm';

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

  // Show loading state while session is being fetched
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 sm:space-y-6 ${BOOKING_SUMMARY_BAR_SPACER}`}>
      {/* The Selected Info Cards below (including the bay-type card carrying
          `id="bd-bay"`) and the AI Lab group-size warning belong to the Session
          sub-step conceptually, but they stay OUTSIDE the <form> for now so this
          split stays a pure move: the <form> is a padded white card, so folding
          them into <SessionStep /> would inset them and wrap them in the form's
          shadow — a visible layout change. Stage D moves them into <SessionStep />
          as part of an intentionally visible change. Please do not "tidy" them in
          before then. */}

      {/* Selected Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6 border border-green-100">
          <div className="flex items-center gap-3">
            <div className="bg-green-50 p-2 sm:p-3 rounded-full">
              <CalendarIcon className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">{t('selectedDate')}</h3>
              <p className="text-lg sm:text-xl font-bold text-green-700">
                {formatDate(selectedDate)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6 border border-green-100">
          <div className="flex items-center gap-3">
            <div className="bg-green-50 p-2 sm:p-3 rounded-full">
              <ClockIcon className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">{t('startTime')}</h3>
              <p className="text-lg sm:text-xl font-bold text-green-700">
                {selectedTime}
              </p>
            </div>
          </div>
        </div>

        <div id="bd-bay" className="bg-white rounded-xl shadow-sm p-3 sm:p-6 border border-green-100 scroll-mt-24">
          <div className="flex items-center gap-3">
            <div className={`p-2 sm:p-3 rounded-full ${
              (selectedBayType === 'ai_lab' || selectedBay === 'ai_lab')
                ? 'bg-purple-50'
                : 'bg-green-50'
            }`}>
              {(selectedBayType === 'ai_lab' || selectedBay === 'ai_lab') ? (
                <ComputerDesktopIcon className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600" />
              ) : (
                <UsersIcon className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">
                {t('bayType')} <span className="text-red-500">*</span>
              </h3>
              {!selectedBayType ? (
                <div className="space-y-2 mt-1">
                  <div className="flex bg-gray-100 rounded-lg p-0.5">
                    <button
                      onClick={() => setSelectedBay('social')}
                      disabled={currentAvailability.social === 0}
                      className={`flex-1 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        selectedBay === 'social'
                          ? 'bg-green-600 text-white shadow-sm'
                          : currentAvailability.social === 0
                          ? 'text-gray-400 cursor-not-allowed'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      {t('social')} {currentAvailability.social === 0 && t('naSuffix')}
                    </button>
                    <button
                      onClick={() => setSelectedBay('ai_lab')}
                      disabled={currentAvailability.ai === 0}
                      className={`flex-1 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        selectedBay === 'ai_lab'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : currentAvailability.ai === 0
                          ? 'text-gray-400 cursor-not-allowed'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      {t('aiLab')} {currentAvailability.ai === 0 && t('naSuffix')}
                    </button>
                  </div>
                  <button
                    onClick={() => setShowBayInfoModal(true)}
                    className="text-xs text-gray-500 hover:text-gray-700 underline transition-colors"
                  >
                    {t('whatsTheDifference')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className={`text-lg sm:text-xl font-bold ${
                    selectedBayType === 'ai_lab' ? 'text-purple-700' : 'text-green-700'
                  }`}>
                    {selectedBayType === 'ai_lab' ? t('aiLab') : t('socialBay')}
                  </p>
                  <button
                    onClick={() => setShowBayInfoModal(true)}
                    className="text-xs text-gray-500 hover:text-gray-700 underline transition-colors"
                  >
                    {t('info')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* AI Lab Group Size Warning */}
      {(selectedBayType === 'ai_lab' || selectedBay === 'ai_lab') && numberOfPeople >= 3 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
          <div className="flex items-start">
            <InformationCircleIcon className="h-5 w-5 text-yellow-400 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-yellow-800 mb-1">
                {t('aiLabRecommendationTitle')}
              </h4>
              <p className="text-sm text-yellow-700">
                {t('aiLabRecommendationBody')}
              </p>
              <button
                onClick={onBack}
                className="mt-2 text-sm text-yellow-600 hover:text-yellow-500 underline"
              >
                {t('aiLabBackToSocial')}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Booking Form. Each section component returns a fragment, so the blocks
          they emit stay direct children of this <form> and keep picking up its
          `space-y-4 sm:space-y-6` spacing. */}
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 bg-white rounded-xl shadow-sm p-3 sm:p-6">
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
        />

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
          onBack={onBack}
          isSubmitting={isSubmitting}
          marketingOptIn={marketingOptIn}
          setMarketingOptIn={setMarketingOptIn}
        />
      </form>

      <BookingSummaryBar
        total={costBreakdown ? costBreakdown.estimatedTotal : null}
        totalLabel={t('summaryTotalLabel')}
        subline={`${duration} hr · ${selectedTime}`}
        ctaLabel={isSubmitting ? t('processing') : t('confirmBooking')}
        onCta={handlePrimaryCta}
        ctaLoading={isSubmitting}
        emptyPrompt={t('summaryEmptyPrompt')}
      />

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
