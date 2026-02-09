import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';
import { LIFF_URLS } from '@/lib/liff/urls';

interface BookingActionsProps {
  canCancel: boolean;
  language: Language;
  onCancelClick: () => void;
  onBack: () => void;
}

export default function BookingActions({ canCancel, language, onCancelClick, onBack }: BookingActionsProps) {
  const t = membershipTranslations[language];

  return (
    <div className="space-y-2">
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
