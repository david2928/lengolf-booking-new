'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Language, isValidLanguage } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';
import { saveLanguagePreference, resolveLanguage } from '@/lib/liff/language-persistence';
import { LIFF_URLS } from '@/lib/liff/urls';
import BookingDetailHeader from '@/components/liff/membership/booking-detail/BookingDetailHeader';
import BookingStatusBanner from '@/components/liff/membership/booking-detail/BookingStatusBanner';
import BookingDetailCard from '@/components/liff/membership/booking-detail/BookingDetailCard';
import BookingActions from '@/components/liff/membership/booking-detail/BookingActions';
import BookingDetailLoading from '@/components/liff/membership/booking-detail/BookingDetailLoading';
import BookingCancelModal from '@/components/liff/membership/BookingCancelModal';

interface BookingDetail {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  bay: string | null;
  bayType: string;
  status: string;
  numberOfPeople: number;
  notes?: string | null;
  packageId?: string | null;
  bookingType: string;
  createdAt: string;
  cancellationReason?: string | null;
  canCancel: boolean;
}

type ViewState = 'loading' | 'error' | 'not_found' | 'access_denied' | 'detail';

export default function BookingDetailPage() {
  const params = useParams<{ bookingId: string }>();
  const bookingId = params?.bookingId ?? '';

  const [viewState, setViewState] = useState<ViewState>('loading');
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [lineUserId, setLineUserId] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [errorMessage, setErrorMessage] = useState('');

  // Cancel modal state
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  useEffect(() => {
    // Load saved language
    setLanguage(resolveLanguage());
    initializeLiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeLiff = async () => {
    try {
      // DEV MODE
      const urlParams = new URLSearchParams(window.location.search);
      const devMode = urlParams.get('dev') === 'true';

      if (devMode && process.env.NODE_ENV === 'development') {
        const testUserId = urlParams.get('userId') || 'U-test-user-123';
        setLineUserId(testUserId);
        await fetchBookingDetail(testUserId);
        return;
      }

      // Wait for LIFF SDK
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

      const liffId = process.env.NEXT_PUBLIC_LIFF_MEMBERSHIP_ID;
      if (!liffId || liffId === 'your-liff-id-here') {
        throw new Error('LIFF Membership ID not configured');
      }

      await window.liff.init({ liffId }).catch((err: Error) => {
        console.error('LIFF init error:', err);
        throw err;
      });

      // Auto-detect language from LINE on first visit
      if (!localStorage.getItem('liff-language')) {
        const lineLang = window.liff.getLanguage?.();
        if (lineLang && isValidLanguage(lineLang)) {
          setLanguage(lineLang);
          localStorage.setItem('liff-language', lineLang);
        }
      }

      if (!window.liff.isLoggedIn()) {
        window.liff.login({ redirectUri: window.location.href });
        return;
      }

      const profile = await window.liff.getProfile();
      setLineUserId(profile.userId);

      await fetchBookingDetail(profile.userId);
    } catch (err) {
      console.error('[BookingDetail] LIFF initialization error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to initialize');
      setViewState('error');
    }
  };

  const fetchBookingDetail = async (userId: string) => {
    try {
      const response = await fetch(
        `/api/liff/membership/booking/${bookingId}?lineUserId=${userId}`
      );

      if (response.status === 403) {
        setViewState('access_denied');
        return;
      }

      if (response.status === 404) {
        setViewState('not_found');
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch booking');
      }

      const data = await response.json();
      setBooking(data);
      setViewState('detail');
    } catch (err) {
      console.error('[BookingDetail] Fetch error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load booking');
      setViewState('error');
    }
  };

  const handleLanguageChange = (newLang: Language) => {
    setLanguage(newLang);
    saveLanguagePreference(newLang, lineUserId || undefined);
  };

  const navigateToMembership = () => {
    window.location.href = LIFF_URLS.membership;
  };

  const handleCancelClick = () => {
    setIsCancelModalOpen(true);
  };

  const handleBookingCancelled = () => {
    if (booking) {
      setBooking({ ...booking, status: 'cancelled', canCancel: false });
    }
  };

  const handleCancelModalClose = () => {
    setIsCancelModalOpen(false);
  };

  const t = membershipTranslations[language];

  if (viewState === 'loading') {
    return <BookingDetailLoading />;
  }

  if (viewState === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full text-center">
          <div className="text-red-600 mb-4">
            <svg className="w-16 h-16 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-bold">{t.error}</h2>
          </div>
          <p className="text-gray-600 mb-4">{errorMessage}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-[#06C755] text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            {t.retry}
          </button>
        </div>
      </div>
    );
  }

  if (viewState === 'not_found') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full text-center">
          <svg className="w-16 h-16 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t.bookingNotFound}</h2>
          <p className="text-gray-600 mb-4">{t.bookingNotFoundDescription}</p>
          <button
            onClick={navigateToMembership}
            className="w-full bg-[#06C755] text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            {t.backToBookings}
          </button>
        </div>
      </div>
    );
  }

  if (viewState === 'access_denied') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full text-center">
          <svg className="w-16 h-16 mx-auto mb-2 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t.accessDenied}</h2>
          <p className="text-gray-600 mb-4">{t.accessDeniedDescription}</p>
          <button
            onClick={navigateToMembership}
            className="w-full bg-[#06C755] text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            {t.backToBookings}
          </button>
        </div>
      </div>
    );
  }

  if (viewState === 'detail' && booking) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BookingDetailHeader
          language={language}
          onLanguageChange={handleLanguageChange}
          onBack={navigateToMembership}
        />

        <div className="px-4 py-6 space-y-4 pb-8">
          <BookingStatusBanner status={booking.status} language={language} />
          <BookingDetailCard booking={booking} language={language} />
          <BookingActions
            canCancel={booking.canCancel}
            language={language}
            onCancelClick={handleCancelClick}
            onBack={navigateToMembership}
          />
        </div>

        {booking.canCancel && (
          <BookingCancelModal
            booking={{
              id: booking.id,
              date: booking.date,
              startTime: booking.startTime,
              duration: booking.duration,
              bay: booking.bay,
              status: booking.status,
              numberOfPeople: booking.numberOfPeople,
              notes: booking.notes,
            }}
            lineUserId={lineUserId}
            language={language}
            isOpen={isCancelModalOpen}
            onClose={handleCancelModalClose}
            onBookingCancelled={handleBookingCancelled}
          />
        )}
      </div>
    );
  }

  return null;
}
