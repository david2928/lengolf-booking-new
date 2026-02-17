'use client';

import { useEffect, useState, useCallback } from 'react';
import { Language } from '@/lib/liff/translations';
import { bookingTranslations } from '@/lib/liff/booking-translations';
import { saveLanguagePreference, resolveLanguage } from '@/lib/liff/language-persistence';
import { format } from 'date-fns';
import { getCurrentBangkokTime } from '@/utils/date';
import BookingHeader from '@/components/liff/booking/BookingHeader';
import DateSelector from '@/components/liff/booking/DateSelector';
import BaySelector from '@/components/liff/booking/BaySelector';
import TimeSlotList, { TimeSlot, BayAvailabilityByDuration } from '@/components/liff/booking/TimeSlotList';
import BookingForm, { BookingFormData, UserProfile, ActivePackage } from '@/components/liff/booking/BookingForm';
import BookingSummary from '@/components/liff/booking/BookingSummary';
import SuccessScreen from '@/components/liff/booking/SuccessScreen';
import { isValidPhoneNumber } from 'react-phone-number-input';
import { BayType } from '@/lib/bayConfig';

type ViewState = 'loading' | 'error' | 'booking' | 'summary' | 'success';
type BookingStep = 'date' | 'bay' | 'time' | 'form';

interface BookingResult {
  bookingId: string;
  bay: string;
  bayDisplayName: string;
}

interface UserDataResponse {
  status: 'linked' | 'not_linked';
  profile?: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    customerId: string;
    customerCode: string;
    preferredLanguage?: string | null;
  };
  activePackage?: {
    id: string;
    displayName: string;
    remainingHours: number;
  };
}

const defaultFormData: BookingFormData = {
  name: '',
  phone: '',
  email: '',
  duration: 1,
  numberOfPeople: 1,
  bayPreference: null,
  playFoodPackage: null,
  clubRental: 'none',
  notes: ''
};

export default function LiffBookingPage() {
  // Core state
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [bookingStep, setBookingStep] = useState<BookingStep>('date');
  const [lineUserId, setLineUserId] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [error, setError] = useState('');

  // User data
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activePackage, setActivePackage] = useState<ActivePackage | null>(null);

  // Booking data
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedBayPreference, setSelectedBayPreference] = useState<BayType | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [formData, setFormData] = useState<BookingFormData>(defaultFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);

  const t = bookingTranslations[language];

  // Initialize LIFF
  useEffect(() => {
    initializeLiff();
    // Load saved language from localStorage (DB sync happens after user data loads)
    setLanguage(resolveLanguage());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeLiff = async () => {
    try {
      // DEV MODE: Test without LIFF (use query param ?dev=true&userId=testUser)
      const urlParams = new URLSearchParams(window.location.search);
      const devMode = urlParams.get('dev') === 'true';

      if (devMode && process.env.NODE_ENV === 'development') {
        const testUserId = urlParams.get('userId') || 'U-test-user-123';
        console.log('[DEV MODE] Bypassing LIFF initialization');
        setLineUserId(testUserId);
        await loadUserData(testUserId);
        return;
      }

      // Wait for LIFF SDK to be available
      if (!window.liff) {
        const maxWait = 5000;
        const startTime = Date.now();
        while (!window.liff && (Date.now() - startTime) < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!window.liff) {
          throw new Error('LIFF SDK failed to load');
        }
      }

      const liffId = process.env.NEXT_PUBLIC_LIFF_BOOKING_ID;
      if (!liffId || liffId === 'your-liff-id-here') {
        console.warn('LIFF Booking ID not configured');
        setError('LIFF not configured');
        setViewState('error');
        return;
      }

      await window.liff.init({ liffId }).catch((err) => {
        console.error('LIFF init error:', err);
        throw err;
      });

      if (!window.liff.isLoggedIn()) {
        window.liff.login({ redirectUri: window.location.href });
        return;
      }

      const profile = await window.liff.getProfile();
      setLineUserId(profile.userId);

      await loadUserData(profile.userId);

    } catch (err) {
      console.error('[Booking] LIFF initialization error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize');
      setViewState('error');
    }
  };

  const loadUserData = async (userId: string) => {
    try {
      const response = await fetch(`/api/liff/booking/user?lineUserId=${userId}`);
      const data: UserDataResponse = await response.json();

      if (!response.ok) {
        // Non-critical error - proceed to booking anyway
        console.warn('[Booking] User data fetch warning:', data);
      }

      // Pre-fill profile data if available (nice-to-have, not required)
      if (data.profile) {
        setUserProfile({
          name: data.profile.name,
          email: data.profile.email,
          phone: data.profile.phone
        });

        if (data.activePackage) {
          setActivePackage(data.activePackage);
        }

        // Cross-device language sync: resolve from DB if localStorage is empty
        const resolved = resolveLanguage(data.profile.preferredLanguage);
        setLanguage(resolved);
      }

      // Always proceed to booking - customer matching happens at booking time
      setViewState('booking');
    } catch (err) {
      console.error('[Booking] User data fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load user data');
      setViewState('error');
    }
  };

  // Filter slots based on selected bay preference
  const filterSlotsByBayPreference = (slots: TimeSlot[], bayPref: BayType | null): TimeSlot[] => {
    if (!bayPref) return slots;

    return slots
      .map((slot) => {
        if (!slot.bayAvailabilityByDuration) {
          // Fallback: use top-level counts
          if (bayPref === 'ai_lab' && (slot.aiLabCount ?? 0) === 0) return null;
          if (bayPref === 'social' && (slot.socialBayCount ?? 0) === 0) return null;
          return slot;
        }

        // Recalculate maxHours based on bay-specific availability
        let maxHours = 0;
        for (const [durationStr, info] of Object.entries(slot.bayAvailabilityByDuration)) {
          const duration = parseInt(durationStr, 10);
          const hasPreferredBay = bayPref === 'ai_lab' ? info.ai > 0 : info.social > 0;
          if (hasPreferredBay) {
            maxHours = duration;
          } else {
            break;
          }
        }

        if (maxHours === 0) return null;
        return { ...slot, maxHours };
      })
      .filter((slot): slot is TimeSlot => slot !== null);
  };

  // Fetch available time slots when date is selected
  const fetchAvailableSlots = useCallback(async (date: Date) => {
    setIsLoadingSlots(true);
    setAvailableSlots([]);
    setSelectedSlot(null);

    try {
      const currentTimeInBangkok = getCurrentBangkokTime();
      const dateString = format(date, 'yyyy-MM-dd');

      const response = await fetch('/api/availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-user-id': lineUserId
        },
        body: JSON.stringify({
          date: dateString,
          currentTimeInBangkok: currentTimeInBangkok.toISOString()
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch availability');
      }

      const data = await response.json();
      const allSlots: TimeSlot[] = (data.slots || []).map((slot: { startTime: string; maxHours: number; period: string; availableBays?: string[]; socialBayCount?: number; aiLabCount?: number; bayAvailabilityByDuration?: BayAvailabilityByDuration }) => ({
        time: slot.startTime,
        maxHours: slot.maxHours,
        period: slot.period,
        availableBays: slot.availableBays,
        socialBayCount: slot.socialBayCount,
        aiLabCount: slot.aiLabCount,
        bayAvailabilityByDuration: slot.bayAvailabilityByDuration,
      }));

      // Filter and adjust slots based on selected bay preference
      const filteredSlots = filterSlotsByBayPreference(allSlots, selectedBayPreference);
      setAvailableSlots(filteredSlots);
    } catch (err) {
      console.error('[Booking] Failed to fetch availability:', err);
      setAvailableSlots([]);
    } finally {
      setIsLoadingSlots(false);
    }
  }, [lineUserId, selectedBayPreference]);

  // Handle date selection
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setBookingStep('bay');
  };

  // Handle bay selection
  const handleBaySelect = (bay: BayType | null) => {
    setSelectedBayPreference(bay);
    // Also update formData to keep in sync
    setFormData(prev => ({ ...prev, bayPreference: bay }));
  };

  // Handle next after bay selection
  const handleBayNext = () => {
    if (selectedDate) {
      setBookingStep('time');
      fetchAvailableSlots(selectedDate);
    }
  };

  // Handle time slot selection
  const handleSlotSelect = (slot: TimeSlot) => {
    setSelectedSlot(slot);
    // Auto-set duration to 1 (user can change in form)
    setFormData(prev => ({
      ...prev,
      duration: Math.min(1, slot.maxHours)
    }));
    setBookingStep('form');
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = t.nameRequired;
    }

    if (!formData.phone) {
      errors.phone = t.phoneRequired;
    } else if (!isValidPhoneNumber(formData.phone)) {
      errors.phone = t.invalidPhone;
    }

    if (!formData.email.trim()) {
      errors.email = t.emailRequired;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = t.invalidEmail;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission (go to summary)
  const handleFormNext = () => {
    if (validateForm()) {
      setViewState('summary');
    }
  };

  // Handle booking confirmation
  const handleConfirmBooking = async () => {
    if (!selectedDate || !selectedSlot) return;

    setIsSubmitting(true);

    try {
      const bookingData = {
        name: formData.name,
        email: formData.email,
        phone_number: formData.phone,
        date: format(selectedDate, 'yyyy-MM-dd'),
        start_time: selectedSlot.time,
        duration: formData.duration,
        number_of_people: formData.numberOfPeople,
        customer_notes: formData.notes || undefined,
        preferred_bay_type: formData.bayPreference || undefined,
        package_id: formData.playFoodPackage?.id || undefined,
        package_info: formData.playFoodPackage
          ? `${formData.playFoodPackage.name} - ${formData.playFoodPackage.price} THB`
          : undefined,
        language
      };

      const response = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-user-id': lineUserId
        },
        body: JSON.stringify(bookingData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create booking');
      }

      setBookingResult({
        bookingId: result.bookingId,
        bay: result.bay,
        bayDisplayName: result.bayDisplayName
      });

      setViewState('success');

    } catch (err) {
      console.error('[Booking] Booking creation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create booking');
      setViewState('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Change language
  const handleLanguageChange = (newLang: Language) => {
    setLanguage(newLang);
    saveLanguagePreference(newLang, lineUserId || undefined);
  };

  // Reset booking flow
  const resetBooking = () => {
    setSelectedDate(null);
    setSelectedBayPreference(null);
    setSelectedSlot(null);
    setAvailableSlots([]);
    setFormData(defaultFormData);
    setFormErrors({});
    setBookingResult(null);
    setBookingStep('date');
    setViewState('booking');
  };

  // Close LIFF
  const closeLiff = () => {
    if (window.liff && typeof window.liff.isInClient === 'function' && window.liff.isInClient()) {
      window.liff.closeWindow?.();
    } else {
      window.close();
    }
  };

  // Calculate end time for success screen
  const getEndTime = () => {
    if (!selectedSlot) return '';
    const startHour = parseInt(selectedSlot.time.split(':')[0], 10);
    const startMin = parseInt(selectedSlot.time.split(':')[1], 10);
    const endHour = startHour + formData.duration;
    return `${endHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`;
  };

  // Navigation helpers
  const goToStep = (step: BookingStep) => {
    setBookingStep(step);
    if (step === 'date') {
      setSelectedBayPreference(null);
      setSelectedSlot(null);
    }
    if (step === 'bay') {
      setSelectedSlot(null);
    }
  };

  const goBackFromSummary = () => {
    setViewState('booking');
    setBookingStep('form');
  };

  // Loading state
  if (viewState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">{t.loading}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (viewState === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{t.error}</h2>
          <p className="text-gray-600 text-sm mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-primary text-white rounded-lg font-medium hover:opacity-90"
          >
            {t.retry}
          </button>
        </div>
      </div>
    );
  }

  // Success state
  if (viewState === 'success' && bookingResult && selectedDate && selectedSlot) {
    // Convert specific bay name to bay type (Social Bay / AI Bay)
    const getBayTypeDisplay = (bay: string) => {
      const bayLower = bay.toLowerCase();
      if (bayLower.includes('ai') || bayLower === 'bay 4' || bayLower === 'bay_4') {
        return { en: 'AI Bay', th: 'AI Bay', ja: 'AIベイ', zh: 'AI Bay' }[language];
      }
      return { en: 'Social Bay', th: 'Social Bay', ja: 'ソーシャルベイ', zh: 'Social Bay' }[language];
    };

    return (
      <SuccessScreen
        language={language}
        booking={{
          bookingId: bookingResult.bookingId,
          date: selectedDate,
          startTime: selectedSlot.time,
          endTime: getEndTime(),
          duration: formData.duration,
          bay: bookingResult.bay,
          bayDisplayName: getBayTypeDisplay(bookingResult.bay),
          numberOfPeople: formData.numberOfPeople
        }}
        onBookAnother={resetBooking}
        onClose={closeLiff}
      />
    );
  }

  // Summary state
  if (viewState === 'summary' && selectedDate && selectedSlot) {
    return (
      <>
        <BookingHeader
          language={language}
          onLanguageChange={handleLanguageChange}
          showBack
          onBack={goBackFromSummary}
        />
        <div className="min-h-screen bg-gray-50 px-4 py-4">
          <BookingSummary
            language={language}
            date={selectedDate}
            timeSlot={selectedSlot}
            formData={formData}
            activePackage={activePackage}
            isSubmitting={isSubmitting}
            onConfirm={handleConfirmBooking}
            onBack={goBackFromSummary}
          />
        </div>
      </>
    );
  }

  // Main booking flow
  const steps: BookingStep[] = ['date', 'bay', 'time', 'form'];
  const currentStepIndex = steps.indexOf(bookingStep);

  return (
    <>
      <BookingHeader
        language={language}
        onLanguageChange={handleLanguageChange}
        showBack={bookingStep !== 'date'}
        onBack={() => {
          if (bookingStep === 'form') goToStep('time');
          else if (bookingStep === 'time') goToStep('bay');
          else if (bookingStep === 'bay') goToStep('date');
        }}
      />

      <div className={`bg-gray-50 px-4 py-4 ${bookingStep === 'bay' || bookingStep === 'form' ? 'pb-24 min-h-[calc(100vh-60px)]' : ''}`}>
        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-1 mb-4">
          {steps.map((step, index) => (
            <div key={step} className="flex items-center gap-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                  bookingStep === step
                    ? 'bg-primary text-white'
                    : index < currentStepIndex
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {index < currentStepIndex ? (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              {index < steps.length - 1 && (
                <div className={`w-6 h-0.5 ${
                  index < currentStepIndex
                    ? 'bg-green-500'
                    : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        {bookingStep === 'date' && (
          <DateSelector
            language={language}
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
          />
        )}

        {bookingStep === 'bay' && (
          <>
            <BaySelector
              language={language}
              selectedBay={selectedBayPreference}
              onBaySelect={handleBaySelect}
            />
            {/* Next Button for Bay Step - iOS Safari fix */}
            <div
              className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50"
              style={{ transform: 'translate3d(0,0,0)', WebkitTransform: 'translate3d(0,0,0)' }}
            >
              <button
                onClick={handleBayNext}
                className="w-full bg-primary text-white font-semibold py-4 rounded-lg hover:opacity-90 active:opacity-80 transition-opacity flex items-center justify-center gap-2"
              >
                {t.next}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </>
        )}

        {bookingStep === 'time' && (
          <>
            {/* Selected Date & Bay Summary */}
            {selectedDate && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedDate.toLocaleDateString(language === 'th' ? 'th-TH' : language === 'ja' ? 'ja-JP' : language === 'zh' ? 'zh-CN' : 'en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    selectedBayPreference === 'ai_lab'
                      ? 'bg-purple-100 text-purple-700'
                      : selectedBayPreference === 'social'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {selectedBayPreference === 'ai_lab' ? t.aiLab : selectedBayPreference === 'social' ? t.socialBay : t.anyBay}
                  </span>
                </div>
              </div>
            )}
            <TimeSlotList
              language={language}
              slots={availableSlots}
              selectedSlot={selectedSlot}
              onSlotSelect={handleSlotSelect}
              isLoading={isLoadingSlots}
            />
          </>
        )}

        {bookingStep === 'form' && selectedSlot && (
          <>
            {/* Selected Date & Time Summary */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 mb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedDate?.toLocaleDateString(language === 'th' ? 'th-TH' : language === 'ja' ? 'ja-JP' : language === 'zh' ? 'zh-CN' : 'en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-900">{selectedSlot.time}</span>
                  </div>
                </div>
              </div>
            </div>
            <BookingForm
              language={language}
              maxDuration={selectedSlot.maxHours}
              profile={userProfile}
              activePackage={activePackage}
              formData={formData}
              onFormChange={setFormData}
              errors={formErrors}
            />

            {/* Sticky Next Button - iOS Safari fix with transform and z-index */}
            <div
              className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50"
              style={{ transform: 'translate3d(0,0,0)', WebkitTransform: 'translate3d(0,0,0)' }}
            >
              <button
                onClick={handleFormNext}
                className="w-full bg-primary text-white font-semibold py-4 rounded-lg hover:opacity-90 active:opacity-80 transition-opacity flex items-center justify-center gap-2"
              >
                {t.next}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
