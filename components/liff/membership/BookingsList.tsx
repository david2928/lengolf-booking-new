import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';
import BookingCard from './BookingCard';

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

interface BookingsListProps {
  bookings: Booking[];
  total: number;
  language: Language;
  onCancelBooking?: (booking: Booking) => void;
}

export default function BookingsList({ bookings, total, language, onCancelBooking }: BookingsListProps) {
  const t = membershipTranslations[language];

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">{t.upcomingBookings}</h2>
          {total > bookings.length && (
            <a
              href="/bookings"
              className="text-sm text-primary font-medium hover:underline"
            >
              {t.viewAll} ({total})
            </a>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {bookings.length > 0 ? (
          bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              language={language}
              onCancelClick={onCancelBooking}
            />
          ))
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-600 text-sm mb-3">{t.noUpcomingBookings}</p>
            <a
              href="/bookings"
              className="inline-block bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90 active:opacity-80 transition-opacity"
            >
              {t.bookNow}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
