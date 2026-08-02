'use client';

import { format } from 'date-fns';
import { th, enUS, ja, zhCN } from 'date-fns/locale';
import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';
import { parseBangkokDate } from '@/utils/date';
import { slotRange, type EditableBooking, type EditSelection } from './EditBookingForm';

interface EditReviewCardProps {
  booking: EditableBooking;
  selection: EditSelection;
  language: Language;
}

/**
 * The review step: every field, before and after.
 *
 * Unchanged rows are shown too rather than hidden. The customer is about to
 * commit a change to a real reservation, and "what is NOT moving" is as much a
 * part of that decision as what is — particularly the bay, which they never
 * chose and which the server may reassign underneath them.
 */
export default function EditReviewCard({ booking, selection, language }: EditReviewCardProps) {
  const t = membershipTranslations[language];
  const locale = language === 'th' ? th : language === 'ja' ? ja : language === 'zh' ? zhCN : enUS;

  const longDate = (iso: string) =>
    format(parseBangkokDate(iso), 'EEEE, MMMM d', { locale });

  const rows = [
    {
      label: t.dateLabel,
      changed: selection.date !== booking.date,
      before: longDate(booking.date),
      after: longDate(selection.date),
    },
    {
      label: t.time,
      changed:
        selection.startTime !== booking.startTime || selection.duration !== booking.duration,
      before: slotRange(booking.startTime, booking.duration),
      after: slotRange(selection.startTime, selection.duration),
    },
    {
      label: t.durationLabel,
      changed: selection.duration !== booking.duration,
      before: `${booking.duration} ${t.hours}`,
      after: `${selection.duration} ${t.hours}`,
    },
    {
      label: t.guestsLabel,
      changed: selection.numberOfPeople !== booking.numberOfPeople,
      before: `${booking.numberOfPeople} ${t.people}`,
      after: `${selection.numberOfPeople} ${t.people}`,
    },
    {
      label: t.bay,
      changed: false,
      before: booking.bayType === 'ai' ? t.aiBay : t.socialBay,
      after: '',
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100">
      <div className="divide-y divide-gray-100">
        {rows.map((row, i) => (
          <div
            key={i}
            className={`flex justify-between items-start px-4 py-3 ${row.changed ? 'bg-green-50' : ''}`}
          >
            <span className="text-sm text-gray-500 flex-shrink-0">{row.label}</span>
            {row.changed ? (
              <span className="text-sm text-right ml-4">
                <span className="text-gray-400 line-through">{row.before}</span>
                <span className="mx-1 text-gray-400">&rarr;</span>
                <span className="font-semibold text-green-700">{row.after}</span>
              </span>
            ) : (
              <span className="text-sm font-medium text-gray-900 text-right ml-4">{row.before}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
