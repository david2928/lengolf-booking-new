import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';

interface Booking {
  id: string;
  date: string;
  startTime: string;
  duration: number;
  bay: string | null;
  status: string;
  numberOfPeople: number;
  notes?: string | null;
  bookingType?: string | null;
}

interface BookingCardProps {
  booking: Booking;
  language: Language;
  onCancelClick?: (booking: Booking) => void;
  detailUrl?: string;
}

export default function BookingCard({ booking, language, onCancelClick, detailUrl }: BookingCardProps) {
  const t = membershipTranslations[language];

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Convert specific bay name to bay type (Social Bay / AI Bay)
  const getBayTypeDisplay = (bay: string | null) => {
    if (!bay) return t.socialBay;
    const bayLower = bay.toLowerCase();
    if (bayLower.includes('ai') || bayLower === 'bay 4' || bayLower === 'bay_4') {
      return t.aiBay;
    }
    return t.socialBay;
  };

  // Check if booking is in the future and can be cancelled (coaching bookings must contact staff)
  const canCancel = () => {
    if (booking.status !== 'confirmed') return false;
    if ((booking.bookingType || '').toLowerCase().includes('coaching')) return false;

    const [year, month, day] = booking.date.split('-').map(Number);
    const [hours, minutes] = booking.startTime.split(':').map(Number);
    const bookingDateTime = new Date(year, month - 1, day, hours, minutes);
    const now = new Date();

    return bookingDateTime.getTime() > now.getTime();
  };

  // Status badge colors
  const statusColors = {
    confirmed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    completed: 'bg-gray-100 text-gray-700',
  };

  const statusText = {
    confirmed: t.confirmed,
    cancelled: t.cancelled,
    completed: t.completed,
  };

  const statusColor = statusColors[booking.status as keyof typeof statusColors] || statusColors.confirmed;
  const statusLabel = statusText[booking.status as keyof typeof statusText] || booking.status;

  const showCancelButton = canCancel() && onCancelClick;

  const cardContent = (
    <>
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="font-bold text-gray-900">
            {formatDate(booking.date)} {t.at} {booking.startTime}
          </p>
          <p className="text-sm text-gray-600">
            {booking.duration} {t.hours} • {booking.numberOfPeople} {t.people}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      <p className="text-sm text-gray-600">
        {t.bay}: <span className="font-medium">{getBayTypeDisplay(booking.bay)}</span>
      </p>

      {showCancelButton && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={(e) => { e.preventDefault(); onCancelClick(booking); }}
            className="w-full py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
          >
            {t.cancelBooking}
          </button>
        </div>
      )}
    </>
  );

  if (detailUrl) {
    return (
      <a
        href={detailUrl}
        className="block bg-white rounded-lg shadow-sm p-4 border border-gray-100 hover:border-primary/30 transition-colors"
      >
        {cardContent}
      </a>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100 hover:border-primary/30 transition-colors">
      {cardContent}
    </div>
  );
}
