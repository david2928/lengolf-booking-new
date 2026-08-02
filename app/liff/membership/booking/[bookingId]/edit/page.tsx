'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Language, isValidLanguage } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';
import { resolveLanguage, saveLanguagePreference } from '@/lib/liff/language-persistence';
import { getLiffBookingDetailUrl } from '@/lib/liff/urls';
import BookingDetailHeader from '@/components/liff/membership/booking-detail/BookingDetailHeader';
import BookingDetailLoading from '@/components/liff/membership/booking-detail/BookingDetailLoading';
import EditBookingForm, {
  type EditSelection,
  type EditableBooking,
} from '@/components/liff/membership/booking-edit/EditBookingForm';
import EditReviewCard from '@/components/liff/membership/booking-edit/EditReviewCard';
import type { TimeSlot } from '@/components/liff/booking/TimeSlotList';
import { getCurrentBangkokTime } from '@/utils/date';
import type { ModifyVipBookingErrorCode } from '@/types/vip';

interface BookingDetail extends EditableBooking {
  endTime: string;
  bay: string | null;
  status: string;
  notes?: string | null;
  bookingType: string;
  canEdit: boolean;
  editBlockedReason: string | null;
}

type ViewState = 'loading' | 'error' | 'blocked' | 'form' | 'review' | 'success';

export default function EditBookingPage() {
  const params = useParams<{ bookingId: string }>();
  const bookingId = params?.bookingId ?? '';

  const [viewState, setViewState] = useState<ViewState>('loading');
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [selection, setSelection] = useState<EditSelection | null>(null);
  const [lineUserId, setLineUserId] = useState('');
  /**
   * The LIFF ID token, which LINE signs. The modify endpoint accepts nothing
   * else — `x-line-user-id` alone is a client-supplied string that anyone could
   * send, and editing is a write against someone's reservation.
   */
  const [lineIdToken, setLineIdToken] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>('en');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const t = membershipTranslations[language];

  const fetchSlots = useCallback(
    async (date: string) => {
      setIsLoadingSlots(true);
      try {
        const response = await fetch('/api/availability', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(lineIdToken ? { 'x-line-id-token': lineIdToken } : {}),
          },
          body: JSON.stringify({
            date,
            currentTimeInBangkok: getCurrentBangkokTime().toISOString(),
            // Ignore this booking when computing availability, or the customer
            // is shown their own slot as occupied. Honoured only for its owner.
            excludeBookingId: bookingId,
          }),
        });

        if (!response.ok) throw new Error('availability request failed');

        const data = await response.json();
        setSlots(
          (data.slots ?? []).map(
            (slot: {
              startTime: string;
              maxHours: number;
              availableBays?: string[];
              socialBayCount?: number;
              aiLabCount?: number;
              bayAvailabilityByDuration?: TimeSlot['bayAvailabilityByDuration'];
            }) => ({
              time: slot.startTime,
              maxHours: slot.maxHours,
              availableBays: slot.availableBays,
              socialBayCount: slot.socialBayCount,
              aiLabCount: slot.aiLabCount,
              bayAvailabilityByDuration: slot.bayAvailabilityByDuration,
            })
          )
        );
      } catch (err) {
        console.error('[EditBooking] Availability error:', err);
        setSlots([]);
      } finally {
        setIsLoadingSlots(false);
      }
    },
    [bookingId, lineIdToken]
  );

  const fetchBookingDetail = useCallback(
    async (userId: string) => {
      // `fresh=1` skips the 30s detail cache; an edit screen must never open on
      // a stale copy of the booking it is about to modify.
      const response = await fetch(
        `/api/liff/membership/booking/${bookingId}?lineUserId=${userId}&fresh=1`
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load booking');
      }

      const data: BookingDetail = await response.json();
      setBooking(data);
      setSelection({
        date: data.date,
        startTime: data.startTime,
        duration: data.duration,
        numberOfPeople: data.numberOfPeople,
      });

      if (!data.canEdit) {
        setErrorMessage(
          data.editBlockedReason === 'COACHING_NOT_EDITABLE'
            ? t.coachingEditHint
            : data.editBlockedReason === 'BOOKING_IN_PAST'
              ? t.errBookingInPast
              : data.editBlockedReason === 'TOO_LATE_TO_EDIT'
                ? t.errTooLateToEdit
                : t.errEditDefault
        );
        setViewState('blocked');
        return;
      }

      setViewState('form');
      void fetchSlots(data.date);
    },
    [bookingId, fetchSlots, t]
  );

  useEffect(() => {
    setLanguage(resolveLanguage());

    const initializeLiff = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const devMode = urlParams.get('dev') === 'true';

        if (devMode && process.env.NODE_ENV === 'development') {
          // Renders the screen locally. The modify call itself will still 401:
          // there is no way to mint a real LINE ID token outside the LINE app,
          // and the endpoint accepts nothing weaker by design.
          const testUserId = urlParams.get('userId') || 'U-test-user-123';
          setLineUserId(testUserId);
          await fetchBookingDetail(testUserId);
          return;
        }

        if (!window.liff) {
          const started = Date.now();
          while (!window.liff && Date.now() - started < 5000) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          if (!window.liff) throw new Error('LIFF SDK failed to load');
        }

        const liffId = process.env.NEXT_PUBLIC_LIFF_MEMBERSHIP_ID;
        if (!liffId || liffId === 'your-liff-id-here') {
          throw new Error('LIFF Membership ID not configured');
        }

        await window.liff.init({ liffId });

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

        // getIDToken can throw or return null on an old session; the modify call
        // then 401s and we send the customer back through login rather than
        // leaving them on a form whose submit never works.
        try {
          setLineIdToken(window.liff.getIDToken?.() ?? null);
        } catch (err) {
          console.warn('[EditBooking] Could not read the LIFF ID token:', err);
        }

        const profile = await window.liff.getProfile();
        setLineUserId(profile.userId);
        await fetchBookingDetail(profile.userId);
      } catch (err) {
        console.error('[EditBooking] Initialization error:', err);
        setErrorMessage(err instanceof Error ? err.message : 'Failed to initialize');
        setViewState('error');
      }
    };

    void initializeLiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateToDetail = () => {
    window.location.href = getLiffBookingDetailUrl(bookingId);
  };

  const handleDateChange = (date: string) => {
    setSelection((prev) => (prev ? { ...prev, date } : prev));
    void fetchSlots(date);
  };

  const hasChanges =
    Boolean(booking && selection) &&
    (selection!.date !== booking!.date ||
      selection!.startTime !== booking!.startTime ||
      selection!.duration !== booking!.duration ||
      selection!.numberOfPeople !== booking!.numberOfPeople);

  const messageForCode = (code: string | undefined, payload: Record<string, unknown>): string => {
    switch (code as ModifyVipBookingErrorCode) {
      case 'SLOT_UNAVAILABLE':
        return payload.otherBayTypeAvailable && booking?.bayType === 'ai'
          ? t.errSlotUnavailableSameType
          : t.errSlotUnavailable;
      case 'CLUB_SET_UNAVAILABLE':
        return t.errClubSetUnavailable;
      case 'PACKAGE_EXPIRED':
        return t.errPackageExpired;
      case 'CREDIT_INVARIANT':
        return t.errCreditInvariant;
      case 'DURATION_LOCKED':
        return t.errDurationLocked;
      case 'COACHING_NOT_EDITABLE':
        return t.errCoaching;
      case 'TOO_LATE_TO_EDIT':
        return t.errTooLateToEdit;
      case 'BOOKING_IN_PAST':
        return t.errBookingInPast;
      case 'STATE_CHANGED':
        return t.errStateChanged;
      case 'UNAUTHORIZED':
        return t.errSessionExpired;
      default:
        return t.errEditDefault;
    }
  };

  const handleConfirm = async () => {
    if (!booking || !selection) return;

    setIsSaving(true);
    setErrorMessage('');

    try {
      const response = await fetch(`/api/vip/bookings/${bookingId}/modify`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-line-user-id': lineUserId,
          ...(lineIdToken ? { 'x-line-id-token': lineIdToken } : {}),
        },
        body: JSON.stringify({
          ...(selection.date !== booking.date ? { date: selection.date } : {}),
          ...(selection.startTime !== booking.startTime
            ? { start_time: selection.startTime }
            : {}),
          ...(selection.duration !== booking.duration ? { duration: selection.duration } : {}),
          ...(selection.numberOfPeople !== booking.numberOfPeople
            ? { number_of_people: selection.numberOfPeople }
            : {}),
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        // An expired cached ID token is the most likely 401 here, and it is
        // recoverable: send them back through LINE login rather than stranding
        // them on a form that cannot submit.
        if (response.status === 401 && window.liff) {
          setErrorMessage(t.errSessionExpired);
          window.liff.login({ redirectUri: window.location.href });
          return;
        }

        setErrorMessage(messageForCode(payload?.code, payload ?? {}));
        if (payload?.code === 'SLOT_UNAVAILABLE' || payload?.code === 'CLUB_SET_UNAVAILABLE') {
          setViewState('form');
          void fetchSlots(selection.date);
        }
        return;
      }

      setViewState('success');
    } catch (err) {
      console.error('[EditBooking] Save error:', err);
      setErrorMessage(t.errEditDefault);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLanguageChange = (next: Language) => {
    setLanguage(next);
    saveLanguagePreference(next, lineUserId || undefined);
  };

  if (viewState === 'loading') return <BookingDetailLoading />;

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gray-50">
      <BookingDetailHeader
        language={language}
        onLanguageChange={handleLanguageChange}
        onBack={navigateToDetail}
      />
      <div className="px-4 py-6 space-y-4 pb-8">{children}</div>
    </div>
  );

  if (viewState === 'error' || viewState === 'blocked') {
    return shell(
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 text-center">
        <p className="text-gray-700 mb-4">{errorMessage}</p>
        <button
          onClick={navigateToDetail}
          className="w-full py-3 text-sm font-medium text-white bg-[#06C755] rounded-lg"
        >
          {t.backToBookings}
        </button>
      </div>
    );
  }

  if (viewState === 'success') {
    return shell(
      <>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center space-x-3">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-lg font-semibold text-green-700">{t.editSuccessTitle}</span>
        </div>
        <p className="text-sm text-gray-600 px-1">{t.editSuccessBody}</p>
        {booking && selection && (
          <EditReviewCard booking={booking} selection={selection} language={language} />
        )}
        <p className="text-xs text-gray-500 px-1">{t.editSuccessEmailNote}</p>
        <button
          onClick={navigateToDetail}
          className="w-full py-3 text-sm font-medium text-white bg-[#06C755] rounded-lg"
        >
          {t.backToBookings}
        </button>
      </>
    );
  }

  if (!booking || !selection) return null;

  if (viewState === 'review') {
    return shell(
      <>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{t.reviewTitle}</h1>
          <p className="text-sm text-gray-600 mt-1">{t.reviewIntro}</p>
        </div>

        <EditReviewCard booking={booking} selection={selection} language={language} />

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{errorMessage}</p>
          </div>
        )}

        <p className="text-xs text-gray-500 px-1">{t.noChargeNote}</p>

        <div className="space-y-2">
          <button
            onClick={handleConfirm}
            disabled={isSaving}
            className="w-full py-3 text-sm font-medium text-white bg-[#06C755] rounded-lg disabled:opacity-60"
          >
            {isSaving ? t.savingChanges : t.confirmChanges}
          </button>
          <button
            onClick={() => setViewState('form')}
            disabled={isSaving}
            className="w-full py-3 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg"
          >
            {t.backToEdit}
          </button>
        </div>
      </>
    );
  }

  return shell(
    <>
      <div>
        <h1 className="text-lg font-bold text-gray-900">{t.editTitle}</h1>
        <p className="text-sm text-gray-600 mt-1">{t.editIntro}</p>
      </div>

      <EditBookingForm
        booking={booking}
        language={language}
        selection={selection}
        onSelectionChange={setSelection}
        slots={slots}
        isLoadingSlots={isLoadingSlots}
        onDateChange={handleDateChange}
      />

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      <div className="space-y-2">
        <button
          onClick={() => {
            setErrorMessage('');
            setViewState('review');
          }}
          disabled={!hasChanges}
          className="w-full py-3 text-sm font-medium text-white bg-[#06C755] rounded-lg disabled:opacity-50"
        >
          {t.reviewChanges}
        </button>
        {!hasChanges && (
          <p className="text-center text-xs text-gray-500">{t.noChangesYet}</p>
        )}
        <button
          onClick={navigateToDetail}
          className="w-full py-3 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg"
        >
          {t.keepBooking}
        </button>
      </div>
    </>
  );
}
