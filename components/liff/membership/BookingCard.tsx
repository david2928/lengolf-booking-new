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
}

interface BookingCardProps {
  booking: Booking;
  language: Language;
}

export default function BookingCard({ booking, language }: BookingCardProps) {
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

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100 hover:border-primary/30 transition-colors">
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

      {booking.bay && (
        <p className="text-sm text-gray-600">
          {t.bay}: <span className="font-medium">{booking.bay}</span>
        </p>
      )}

      {!booking.bay && booking.status === 'confirmed' && (
        <p className="text-sm text-gray-500 italic">
          {t.bay}: {t.toBeDetermined}
        </p>
      )}
    </div>
  );
}
