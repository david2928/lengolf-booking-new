'use client';

import { Language } from '@/lib/liff/translations';
import { bookingTranslations } from '@/lib/liff/booking-translations';
import { LIFF_URLS } from '@/lib/liff/urls';
import { format } from 'date-fns';
import { th, enUS, ja, zhCN } from 'date-fns/locale';

interface BookingDetails {
  bookingId: string;
  date: Date;
  startTime: string;
  endTime: string;
  duration: number;
  bay: string;
  bayDisplayName: string;
  numberOfPeople: number;
}

interface SuccessScreenProps {
  language: Language;
  booking: BookingDetails;
  onBookAnother: () => void;
  onClose: () => void;
}

export default function SuccessScreen({
  language,
  booking,
  onBookAnother,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onClose
}: SuccessScreenProps) {
  const t = bookingTranslations[language];
  const locale = language === 'th' ? th : language === 'ja' ? ja : language === 'zh' ? zhCN : enUS;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Success Icon */}
          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.bookingConfirmed}</h1>
            <p className="text-gray-600">{t.thankYou}</p>
          </div>

          {/* Booking Details Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-4">
            <div className="text-center mb-4 pb-4 border-b border-gray-100">
              <div className="text-xs text-gray-500 uppercase tracking-wide">{t.bookingId}</div>
              <div className="text-lg font-bold text-primary mt-1">{booking.bookingId}</div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">{t.date}</span>
                <span className="text-sm font-medium text-gray-900">
                  {format(booking.date, 'EEEE, MMM d', { locale })}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-sm text-gray-500">{t.time}</span>
                <span className="text-sm font-medium text-gray-900">
                  {booking.startTime} - {booking.endTime}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-sm text-gray-500">{t.totalDuration}</span>
                <span className="text-sm font-medium text-gray-900">
                  {booking.duration} {booking.duration === 1 ? t.hour : t.hours}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-sm text-gray-500">{t.bay}</span>
                <span className="text-sm font-medium text-gray-900">{booking.bayDisplayName}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-sm text-gray-500">{t.guests}</span>
                <span className="text-sm font-medium text-gray-900">
                  {booking.numberOfPeople} {booking.numberOfPeople === 1 ? t.person : t.people}
                </span>
              </div>
            </div>
          </div>

          {/* Confirmation Notice */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-blue-800">{t.confirmationSent}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={onBookAnother}
              className="w-full bg-primary text-white font-semibold py-4 rounded-lg hover:opacity-90 active:opacity-80 transition-opacity"
            >
              {t.bookAnother}
            </button>

            <a
              href={LIFF_URLS.membership}
              className="w-full bg-gray-100 text-gray-700 font-medium py-3 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {{ en: 'Manage My Bookings', th: 'จัดการการจอง', ja: '予約管理', zh: '管理我的预约' }[language]}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
