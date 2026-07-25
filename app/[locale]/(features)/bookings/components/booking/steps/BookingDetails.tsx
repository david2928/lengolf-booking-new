'use client';

import Image from 'next/image';
import {
  CalendarIcon,
  ClockIcon,
  CheckIcon,
  UsersIcon,
  ComputerDesktopIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { getIndoorPrice, getSetThumbnailUrl, getGearUpItems } from '@/types/golf-club-rental';
import { BayInfoModal } from '../../BayInfoModal';
import { ProjectedCostBreakdown } from '@/components/booking/ProjectedCostBreakdown';
import { BookingSummaryBar, BOOKING_SUMMARY_BAR_SPACER } from '@/components/shared/BookingSummaryBar';
import { NoAvailabilityModal } from './details/modals/NoAvailabilityModal';
import { SubmitOverlay } from './details/modals/SubmitOverlay';
import { PackageDetailsModal } from './details/modals/PackageDetailsModal';
import { ClubRentalDetailsModal } from './details/modals/ClubRentalDetailsModal';
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


      {/* Booking Form */}
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 bg-white rounded-xl shadow-sm p-3 sm:p-6">
        {/* Play & Food Package Selection */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              {t('playFoodPackageLabel')}
            </label>
            <button
              type="button"
              onClick={() => setShowPackageModal(true)}
              className="text-xs text-green-600 hover:text-green-700 underline"
            >
              {t('viewDetails')}
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => {
                setLocalSelectedPackage(null);
                setDuration(1);
                setNumberOfPeople(1);
                router.replace('/bookings', { scroll: false });
              }}
              className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs relative ${
                !localSelectedPackage
                  ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                  : 'border-gray-300 text-gray-700 hover:border-green-600'
              }`}
            >
              <span className="font-semibold text-[11px] sm:text-xs">{t('bayOnly')}</span>
              <span className="text-[9px] sm:text-[10px] mt-0.5 opacity-75">{t('bayOnlyDescription')}</span>
            </button>
            
            {PLAY_FOOD_PACKAGES.map((pkg) => {
              const isAvailable = pkg.duration <= maxDuration;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  disabled={!isAvailable}
                  onClick={() => {
                    if (isAvailable) {
                      setLocalSelectedPackage(pkg);
                      setDuration(pkg.duration);
                      const newUrl = `/bookings?package=${pkg.id}`;
                      router.replace(newUrl, { scroll: false });
                    }
                  }}
                  className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
                    localSelectedPackage?.id === pkg.id
                      ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                      : !isAvailable
                      ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                      : 'border-gray-300 text-gray-700 hover:border-green-600'
                  }`}
                >
                  <span className="text-lg font-bold mb-1">{pkg.id.split('_')[1]}</span>
                  <span>฿{pkg.price.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
          
          {localSelectedPackage ? (
            <div className="mt-4 p-3 bg-green-50 rounded-lg">
              <div className="text-sm font-medium text-green-800 mb-2">
                {t('selectedPackageInline', {
                  name: localSelectedPackage.name,
                  duration: localSelectedPackage.duration,
                  price: localSelectedPackage.price.toLocaleString(),
                })}
              </div>
              <div className="text-xs text-gray-600">
                <span className="font-medium">{t('packageIncludes')}</span> Golf simulator, {localSelectedPackage.foodItems.map(f => f.name).join(', ')}, {localSelectedPackage.drinks.map(d => d.type === 'unlimited' ? `Unlimited ${d.name}` : d.type === 'per_person' ? `${d.quantity}x ${d.name} per person` : `${d.quantity}x ${d.name}`).join(', ')}
              </div>
            </div>
          ) : (
            <div className="mt-3 text-xs text-gray-500 text-center">
              {t('bayOnlyHelper')}
            </div>
          )}
        </div>


        {/* Duration Selection - Only for regular bookings */}
        {!localSelectedPackage && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('durationLabel')}
            </label>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: maxDuration }, (_, i) => i + 1).map((hours) => (
                <button
                  key={hours}
                  type="button"
                  onClick={() => setDuration(hours)}
                  className={`flex h-12 items-center justify-center rounded-lg border relative ${
                    duration === hours
                      ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                      : 'border-gray-300 text-gray-700 hover:border-green-600'
                  }`}
                >
                  {hours}
                </button>
              ))}
            </div>
            {errors.duration && (
              <p className="mt-1 text-sm text-red-600">{errors.duration}</p>
            )}

            {/* Bay availability indicator for current duration */}
            {slotData?.bayAvailabilityByDuration && currentAvailability.total > 0 && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <InformationCircleIcon className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <span className="font-medium text-blue-900">{t('availableForDuration', { duration })}</span>
                    {currentAvailability.social > 0 && currentAvailability.ai > 0 && (
                      <span className="text-blue-700">
                        {t('availableSocialOrAi', { social: currentAvailability.social, ai: currentAvailability.ai })}
                      </span>
                    )}
                    {currentAvailability.social > 0 && currentAvailability.ai === 0 && (
                      <span className="text-blue-700">
                        {t('availableSocialOnly', { social: currentAvailability.social })}
                      </span>
                    )}
                    {currentAvailability.social === 0 && currentAvailability.ai > 0 && (
                      <span className="text-blue-700">
                        {t('availableAiOnly')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Number of People */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('numberOfPeople')}
          </label>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setNumberOfPeople(num)}
                className={`flex h-12 items-center justify-center rounded-lg border ${
                  numberOfPeople === num
                    ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                    : 'border-gray-300 text-gray-700 hover:border-green-600'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Golf Club Rental Selection */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              {t('clubRentalLabel')}
            </label>
            <button
              type="button"
              onClick={() => setShowClubRentalModal(true)}
              className="text-xs text-green-600 hover:text-green-700 underline"
            >
              {t('viewDetails')}
            </button>
          </div>

          {/* No Rental / Standard row */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              type="button"
              onClick={() => { onClubRentalChange?.('none'); onClubSetIdChange?.(null); }}
              className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
                selectedClubRental === 'none'
                  ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                  : 'border-gray-300 text-gray-700 hover:border-green-600'
              }`}
            >
              <span className="font-semibold text-[11px] sm:text-xs">{t('noRental')}</span>
              <span className="text-[9px] sm:text-[10px] mt-0.5 opacity-75">{t('noRentalDescription')}</span>
            </button>

            <button
              type="button"
              onClick={() => { onClubRentalChange?.('standard'); onClubSetIdChange?.(null); }}
              className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
                selectedClubRental === 'standard'
                  ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                  : 'border-gray-300 text-gray-700 hover:border-green-600'
              }`}
            >
              <span className="font-semibold text-[11px] sm:text-xs">{t('standardSet')}</span>
              <span className="text-[9px] sm:text-[10px] mt-0.5 opacity-75 text-gray-500">{t('standardSetFree')}</span>
            </button>
          </div>

          {/* Premium club sets from DB with real availability */}
          {clubSetsLoading ? (
            <div className="text-xs text-gray-400 text-center py-3">{t('checkingClubAvailability')}</div>
          ) : availableClubSets.length > 0 ? (
            <div className="space-y-2">
              {availableClubSets.map((clubSet) => {
                const isSelected = selectedClubSetId === clubSet.id;
                const isAvailable = clubSet.available_count > 0;
                const price = getIndoorPrice(clubSet, duration);
                const isPremiumPlus = clubSet.tier === 'premium-plus';
                const thumbUrl = getSetThumbnailUrl(clubSet);

                return (
                  <button
                    key={clubSet.id}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => {
                      if (!isAvailable) return;
                      onClubRentalChange?.(clubSet.tier);
                      onClubSetIdChange?.(clubSet.id);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      !isAvailable
                        ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                        : isSelected && isPremiumPlus
                          ? 'border-[#c8a96e] text-white'
                          : isSelected
                            ? 'border-green-600 bg-green-50'
                            : 'border-gray-300 hover:border-green-600'
                    }`}
                    style={isSelected && isPremiumPlus ? { backgroundColor: '#003d1f' } : undefined}
                  >
                    {thumbUrl && (
                      <div className={`relative w-14 h-14 rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center border ${
                        isSelected && isPremiumPlus ? 'bg-white border-white/30' : 'bg-white border-gray-200'
                      }`}>
                        <Image
                          src={thumbUrl}
                          alt={`${clubSet.brand ?? ''} ${clubSet.model ?? ''}`.trim() || 'Club set'}
                          fill
                          className="object-contain p-0.5"
                          sizes="56px"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold text-xs ${
                          isSelected && isPremiumPlus ? 'text-white' :
                          isSelected ? 'text-green-700' :
                          isPremiumPlus ? 'text-[#003d1f]' : 'text-gray-900'
                        }`}>
                          {isPremiumPlus ? t('premiumPlusLabel') : t('premiumLabel')} — {clubSet.gender === 'mens' ? t('clubSetMens') : t('clubSetWomens')}
                        </span>
                        {!isAvailable && (
                          <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">{t('clubSetUnavailable')}</span>
                        )}
                      </div>
                      <div className={`text-[11px] mt-0.5 ${
                        isSelected && isPremiumPlus ? 'text-white/70' :
                        isSelected ? 'text-green-600/70' : 'text-gray-500'
                      }`}>
                        {clubSet.brand} {clubSet.model}
                      </div>
                    </div>
                    <div className={`text-right flex-shrink-0 ml-auto ${
                      isSelected && isPremiumPlus ? 'text-white' :
                      isSelected ? 'text-green-700' : 'text-gray-900'
                    }`}>
                      <div className="font-bold text-sm">฿{price.toLocaleString()}</div>
                      <div className={`text-[10px] ${
                        isSelected && isPremiumPlus ? 'text-white/60' : 'text-gray-400'
                      }`}>{t('clubSetDurationSuffix', { hours: duration })}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Fallback to static buttons if DB fetch fails */
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { onClubRentalChange?.('premium'); onClubSetIdChange?.(null); }}
                className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
                  selectedClubRental === 'premium'
                    ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                    : 'border-gray-300 text-gray-700 hover:border-green-600'
                }`}
              >
                <span className="font-semibold text-[11px] sm:text-xs text-green-600 font-bold">{t('premiumLabel')}</span>
                <span className="text-[10px] sm:text-xs mt-0.5 opacity-75">{t('premiumStartingFromShort')}</span>
              </button>

              <button
                type="button"
                onClick={() => { onClubRentalChange?.('premium-plus'); onClubSetIdChange?.(null); }}
                className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs transition-colors ${
                  selectedClubRental === 'premium-plus'
                    ? 'border-[#c8a96e] text-white font-medium'
                    : 'border-gray-300 text-gray-700 hover:border-[#c8a96e]'
                }`}
                style={selectedClubRental === 'premium-plus' ? { backgroundColor: '#003d1f' } : undefined}
              >
                <span className="font-bold text-[11px] sm:text-xs" style={{ color: selectedClubRental === 'premium-plus' ? '#ffffff' : '#003d1f' }}>
                  {t('premiumPlusLabel')}
                </span>
                <span className={`text-[10px] sm:text-xs mt-0.5 ${selectedClubRental === 'premium-plus' ? 'text-white/80' : 'opacity-75'}`}>{t('premiumPlusStartingFromShort')}</span>
              </button>
            </div>
          )}

        </div>

        {/* Gear Up — optional add-on items sold at booking time (e.g. glove). */}
        {(() => {
          const gearUpItems = getGearUpItems().filter((g) => g.id === 'gloves');
          if (gearUpItems.length === 0) return null;
          return (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                {t('gearUpLabel')}
              </label>
              <div className="grid grid-cols-1 gap-2">
                {gearUpItems.map((item) => {
                  const isSelected = !!selectedAddOns[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onAddOnsChange?.({ ...selectedAddOns, [item.id]: !isSelected })}
                      className={`group flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                        isSelected
                          ? 'border-green-600 bg-green-50 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-green-300'
                      }`}
                    >
                      <div className={`relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0 border ${
                        isSelected ? 'bg-white border-green-200' : 'bg-gray-50 border-gray-200'
                      }`}>
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          sizes="64px"
                          className="object-contain p-1"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 leading-tight">{item.name}</p>
                        {item.description && (
                          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{item.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className="text-sm font-bold text-green-700">฿{formatter.number(item.price)}</p>
                        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-green-600 border-green-600' : 'border-gray-300 bg-white'
                        }`}>
                          {isSelected && <CheckIcon className="h-4 w-4 text-white stroke-[3]" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Contact Information Section */}
        <div className="pt-4 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('contactInformation')}</h3>
          
          <div className="space-y-4">
            {/* Name field */}
            <div id="bd-name" className="scroll-mt-24">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('name')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errorField === 'bd-name') setErrorField(null);
                }}
                className={`w-full h-12 px-4 rounded-lg focus:outline-none ${
                  errorField === 'bd-name'
                    ? 'border-amber-500 bg-amber-50'
                    : `bg-gray-50 ${!name ? 'border-red-100' : 'border-green-500'}`
                } border focus:border-green-500 focus:ring-1 focus:ring-green-500`}
                placeholder={t('namePlaceholder')}
              />
              {errorField === 'bd-name' && (
                <p className="mt-1 text-sm font-medium text-amber-600">{t('errorNeedName')}</p>
              )}
            </div>

            {/* Phone Number */}
            <div id="bd-phone" className="scroll-mt-24">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('phoneNumber')}
              </label>
              <div className="relative">
                <PhoneInput
                  international
                  defaultCountry="TH"
                  placeholder={t('phoneNumberPlaceholder')}
                  value={phoneNumber}
                  onChange={(value) => {
                    setPhoneNumber(value);
                    if (errorField === 'bd-phone') setErrorField(null);
                  }}
                  className={`w-full h-12 px-3 py-2 rounded-lg focus:outline-none border focus:border-green-500 focus:ring-1 focus:ring-green-500 custom-phone-input ${
                    errorField === 'bd-phone'
                      ? 'border-amber-500 bg-amber-50'
                      : `bg-gray-50 ${
                          errors.phoneNumber
                            ? 'border-red-500'
                            : (phoneNumber && isValidPhoneNumber(phoneNumber || ''))
                            ? 'border-green-500'
                            : 'border-gray-200'
                        }`
                  }`}
                />
              </div>
              {/* Helper text to guide country selection if number is empty */}
              {!phoneNumber && (
                <p className="mt-1 text-xs text-gray-500">
                  {t('phoneCountryHelper')}
                </p>
              )}
              {errorField === 'bd-phone' && (
                <p className="mt-1 text-sm font-medium text-amber-600">{t('errorNeedPhone')}</p>
              )}
              {errors.phoneNumber && (
                <p className="mt-1 text-sm text-red-600">{errors.phoneNumber}</p>
              )}
            </div>

            {/* Email */}
            <div id="bd-email" className="scroll-mt-24">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('emailAddress')}
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorField === 'bd-email') setErrorField(null);
                  }}
                  className={`w-full h-12 px-4 rounded-lg focus:outline-none ${
                    errorField === 'bd-email'
                      ? 'border border-amber-500 bg-amber-50 focus:border-green-500 focus:ring-1 focus:ring-green-500'
                      : !email
                      ? 'bg-gray-50 border border-red-100 focus:border-green-500 focus:ring-1 focus:ring-green-500'
                      : 'bg-gray-50 border border-green-500'
                  }`}
                  placeholder={isLineUser ? t('emailPlaceholderLine') : t('emailPlaceholderDefault')}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {t('emailConfirmationNote')}
              </p>
              {errorField === 'bd-email' && (
                <p className="mt-1 text-sm font-medium text-amber-600">{t('errorNeedEmail')}</p>
              )}
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email}</p>
              )}
            </div>
          </div>
        </div>

        {/* Add Customer Notes/Special Requests field */}
        <div>
          <label htmlFor="customerNotes" className="block text-sm font-medium text-gray-700 mb-1">
            {t('notesLabel')}
          </label>
          <textarea
            id="customerNotes"
            value={customerNotes}
            onChange={(e) => setCustomerNotes(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none text-sm sm:text-base"
            placeholder={t('notesPlaceholder')}
          />
          <p className="mt-1 text-xs sm:text-sm text-gray-500">
            {t('notesHelper')}
          </p>
        </div>

        {/* Projected Cost Breakdown */}
        {costBreakdown && (
          <div className="mt-4">
            <ProjectedCostBreakdown
              breakdown={costBreakdown}
              isLoading={costDataLoading}
              language={costLanguage}
            />
          </div>
        )}

        {/* Back only. The primary action lives in the sticky bar so it is
            always reachable without scrolling past the whole form. */}
        <div className="flex justify-start mt-6">
          <button
            type="button"
            onClick={onBack}
            className="py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            disabled={isSubmitting}
          >
            {t('back')}
          </button>
        </div>

        {/* Marketing opt-in: only meaningful once an email is entered. */}
        {email.trim().length > 0 && (
          <label
            htmlFor="booking-marketing-opt-in"
            className="mt-4 flex items-start gap-3 p-3 rounded-md cursor-pointer"
            style={{
              backgroundColor: 'rgba(0, 90, 50, 0.08)',
              border: '1px solid rgba(0, 90, 50, 0.4)',
            }}
          >
            <input
              id="booking-marketing-opt-in"
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[#005a32]"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
              disabled={isSubmitting}
            />
            <span className="text-sm text-gray-800">
              <span className="font-medium block">{t('marketingOptInLabel')}</span>
              <span className="text-gray-600">{t('marketingOptInDescription')}</span>
            </span>
          </label>
        )}

        <p className="text-xs text-gray-400 text-center mt-3">
          {t('consentNote')}
        </p>
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
