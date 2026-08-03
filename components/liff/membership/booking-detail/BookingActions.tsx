import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';
import { LIFF_URLS } from '@/lib/liff/urls';

interface BookingActionsProps {
  canCancel: boolean;
  /** From the detail API. False for coaching, past, and non-confirmed bookings. */
  canEdit?: boolean;
  /** True when editing is blocked specifically because it is a lesson. */
  isCoaching?: boolean;
  language: Language;
  onEditClick?: () => void;
  onCancelClick: () => void;
  onBack: () => void;
}

export default function BookingActions({
  canCancel,
  canEdit = false,
  isCoaching = false,
  language,
  onEditClick,
  onCancelClick,
  onBack,
}: BookingActionsProps) {
  const t = membershipTranslations[language];

  return (
    <div className="space-y-2">
      {canEdit && onEditClick && (
        <button
          onClick={onEditClick}
          className="w-full py-3 text-sm font-medium text-white bg-[#005a32] rounded-lg hover:bg-[#004025] transition-colors"
        >
          {t.editBooking}
        </button>
      )}
      {/* A lesson has to be moved with the coach, so point at LINE rather than
          showing a button that would be refused. Deliberately NOT gated on
          `canCancel`: the detail route sets `canCancel = ... && !isCoaching`, so
          the two can never both be true and the hint would never render. */}
      {!canEdit && isCoaching && (
        <p className="px-1 pb-1 text-xs text-gray-500 text-center">{t.coachingEditHint}</p>
      )}
      {canCancel && (
        <button
          onClick={onCancelClick}
          className="w-full py-3 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
        >
          {t.cancelBooking}
        </button>
      )}
      <a
        href={LIFF_URLS.booking}
        className="block w-full py-3 text-sm font-medium text-white bg-[#06C755] rounded-lg hover:bg-[#05b34c] transition-colors text-center"
      >
        {t.bookAgain}
      </a>
      <button
        onClick={onBack}
        className="w-full py-3 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
      >
        {t.backToBookings}
      </button>
    </div>
  );
}
