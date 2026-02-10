'use client';

import { Language } from '@/lib/liff/translations';
import { bookingTranslations } from '@/lib/liff/booking-translations';
import { BookingFormData, ActivePackage } from './BookingForm';
import { TimeSlot } from './TimeSlotList';
import { format } from 'date-fns';
import { th, enUS, ja, zhCN } from 'date-fns/locale';

interface BookingSummaryProps {
  language: Language;
  date: Date;
  timeSlot: TimeSlot;
  formData: BookingFormData;
  activePackage?: ActivePackage | null;
  isSubmitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

export default function BookingSummary({
  language,
  date,
  timeSlot,
  formData,
  activePackage,
  isSubmitting,
  onConfirm,
  onBack
}: BookingSummaryProps) {
  const t = bookingTranslations[language];
  const locale = language === 'th' ? th : language === 'ja' ? ja : language === 'zh' ? zhCN : enUS;

  // Calculate end time
  const startHour = parseInt(timeSlot.time.split(':')[0], 10);
  const startMin = parseInt(timeSlot.time.split(':')[1], 10);
  const endHour = startHour + formData.duration;
  const endTime = `${endHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`;

  const getBayPreferenceLabel = () => {
    if (formData.bayPreference === 'social') return t.socialBay;
    if (formData.bayPreference === 'ai_lab') return t.aiLab;
    return t.anyBay;
  };

  const getClubRentalLabel = () => {
    if (formData.clubRental === 'standard') return `${t.standardClubs} (${t.free})`;
    if (formData.clubRental === 'premium') return `${t.premiumClubs} (500 THB)`;
    return t.noRental;
  };

  return (
    <div className="pb-24">
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t.bookingSummary}</h2>

        <div className="space-y-4">
          {/* Date & Time */}
          <div className="flex justify-between items-start border-b border-gray-100 pb-3">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">{t.date}</div>
              <div className="text-sm font-medium text-gray-900 mt-0.5">
                {format(date, 'EEEE, MMMM d, yyyy', { locale })}
              </div>
            </div>
          </div>

          <div className="flex justify-between items-start border-b border-gray-100 pb-3">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">{t.time}</div>
              <div className="text-sm font-medium text-gray-900 mt-0.5">
                {timeSlot.time} - {endTime}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 uppercase tracking-wide">{t.totalDuration}</div>
              <div className="text-sm font-medium text-gray-900 mt-0.5">
                {formData.duration} {formData.duration === 1 ? t.hour : t.hours}
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="border-b border-gray-100 pb-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t.contactInfo}</div>
            <div className="text-sm text-gray-900">{formData.name}</div>
            <div className="text-sm text-gray-600">{formData.phone}</div>
            <div className="text-sm text-gray-600">{formData.email}</div>
          </div>

          {/* Bay & Guests */}
          <div className="flex justify-between items-start border-b border-gray-100 pb-3">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">{t.bay}</div>
              <div className="text-sm font-medium text-gray-900 mt-0.5">{getBayPreferenceLabel()}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 uppercase tracking-wide">{t.guests}</div>
              <div className="text-sm font-medium text-gray-900 mt-0.5">
                {formData.numberOfPeople} {formData.numberOfPeople === 1 ? t.person : t.people}
              </div>
            </div>
          </div>

          {/* Package Info */}
          {activePackage && (
            <div className="border-b border-gray-100 pb-3">
              <div className="text-xs text-gray-500 uppercase tracking-wide">{t.package}</div>
              <div className="text-sm font-medium text-primary mt-0.5">{activePackage.displayName}</div>
              <div className="text-xs text-gray-500">{activePackage.remainingHours} {t.hoursRemaining}</div>
            </div>
          )}

          {/* Play & Food Package */}
          {formData.playFoodPackage && (
            <div className="border-b border-gray-100 pb-3">
              <div className="text-xs text-gray-500 uppercase tracking-wide">{t.playFoodPackage}</div>
              <div className="text-sm font-medium text-gray-900 mt-0.5">{formData.playFoodPackage.name}</div>
              <div className="text-xs text-gray-500">
                {formData.playFoodPackage.foodItems.map(f => f.name).join(', ')}
              </div>
              <div className="text-sm font-semibold text-primary mt-1">
                {formData.playFoodPackage.price.toLocaleString()} THB
              </div>
            </div>
          )}

          {/* Club Rental */}
          <div className="pb-1">
            <div className="text-xs text-gray-500 uppercase tracking-wide">{t.clubs}</div>
            <div className="text-sm font-medium text-gray-900 mt-0.5">{getClubRentalLabel()}</div>
          </div>

          {/* Notes */}
          {formData.notes && (
            <div className="border-t border-gray-100 pt-3">
              <div className="text-xs text-gray-500 uppercase tracking-wide">{t.notes}</div>
              <div className="text-sm text-gray-700 mt-0.5">{formData.notes}</div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Bottom Buttons - iOS Safari fix */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 space-y-2 z-50"
        style={{ transform: 'translate3d(0,0,0)', WebkitTransform: 'translate3d(0,0,0)' }}
      >
        <button
          onClick={onConfirm}
          disabled={isSubmitting}
          className="w-full bg-primary text-white font-semibold py-4 rounded-lg hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {t.processing}
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {t.confirmBooking}
            </>
          )}
        </button>

        <button
          onClick={onBack}
          disabled={isSubmitting}
          className="w-full bg-gray-100 text-gray-700 font-medium py-3 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors disabled:opacity-50"
        >
          {t.back}
        </button>
      </div>
    </div>
  );
}
