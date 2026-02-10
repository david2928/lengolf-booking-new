import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';

interface BookingData {
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
  bookingType: string;
  createdAt: string;
  cancellationReason?: string | null;
}

interface BookingDetailCardProps {
  booking: BookingData;
  language: Language;
}

export default function BookingDetailCard({ booking, language }: BookingDetailCardProps) {
  const t = membershipTranslations[language];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(language === 'th' ? 'th-TH' : language === 'ja' ? 'ja-JP' : language === 'zh' ? 'zh-CN' : 'en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatCreatedAt = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(language === 'th' ? 'th-TH' : language === 'ja' ? 'ja-JP' : language === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const bayTypeDisplay = booking.bayType === 'ai' ? t.aiBay : t.socialBay;

  const getBookingTypeDisplay = () => {
    const bt = booking.bookingType.toLowerCase();
    if (bt.includes('coaching')) return t.coaching;
    if (bt === 'package' || bt.includes('package')) return t.package;
    return t.regular;
  };
  const bookingTypeDisplay = getBookingTypeDisplay();

  const rows: { label: string; value: string }[] = [
    { label: t.dateLabel, value: formatDate(booking.date) },
    { label: t.time, value: `${booking.startTime} - ${booking.endTime}` },
    { label: t.durationLabel, value: `${booking.duration} ${t.hours}` },
    { label: t.bay, value: bayTypeDisplay },
    { label: t.guestsLabel, value: `${booking.numberOfPeople} ${t.people}` },
    { label: t.bookingType, value: bookingTypeDisplay },
  ];

  if (booking.notes) {
    rows.push({ label: t.notes, value: booking.notes });
  }

  if (booking.status === 'cancelled' && booking.cancellationReason) {
    rows.push({ label: t.cancellationReasonLabel, value: booking.cancellationReason });
  }

  rows.push({ label: t.bookingId, value: booking.id });
  rows.push({ label: t.bookedOn, value: formatCreatedAt(booking.createdAt) });

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100">
      <div className="divide-y divide-gray-100">
        {rows.map((row, i) => (
          <div key={i} className="flex justify-between items-start px-4 py-3">
            <span className="text-sm text-gray-500 flex-shrink-0">{row.label}</span>
            <span className="text-sm font-medium text-gray-900 text-right ml-4">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
