'use client';

import { Language } from '@/lib/liff/translations';
import { bookingTranslations } from '@/lib/liff/booking-translations';

export interface TimeSlot {
  time: string;
  maxHours: number;
  availableBays?: string[];
}

interface TimeSlotListProps {
  language: Language;
  slots: TimeSlot[];
  selectedSlot: TimeSlot | null;
  onSlotSelect: (slot: TimeSlot) => void;
  isLoading?: boolean;
}

type Period = 'morning' | 'afternoon' | 'evening';

const getPeriod = (time: string): Period => {
  const hour = parseInt(time.split(':')[0], 10);
  if (hour < 13) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

const periodIcons: Record<Period, JSX.Element> = {
  morning: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  afternoon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  evening: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  )
};

export default function TimeSlotList({
  language,
  slots,
  selectedSlot,
  onSlotSelect,
  isLoading = false
}: TimeSlotListProps) {
  const t = bookingTranslations[language];

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <h2 className="text-base font-semibold text-gray-900 mb-3">{t.selectTime}</h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 w-20 bg-gray-200 rounded mb-2"></div>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="h-14 bg-gray-100 rounded-lg"></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <h2 className="text-base font-semibold text-gray-900 mb-3">{t.selectTime}</h2>
        <div className="text-center py-8 text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>{t.noSlotsAvailable}</p>
        </div>
      </div>
    );
  }

  // Group slots by period
  const groupedSlots = slots.reduce((acc, slot) => {
    const period = getPeriod(slot.time);
    if (!acc[period]) acc[period] = [];
    acc[period].push(slot);
    return acc;
  }, {} as Record<Period, TimeSlot[]>);

  const periodLabels: Record<Period, string> = {
    morning: t.morning,
    afternoon: t.afternoon,
    evening: t.evening
  };

  const periods: Period[] = ['morning', 'afternoon', 'evening'];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-3">{t.selectTime}</h2>

      <div className="space-y-4">
        {periods.map((period) => {
          const periodSlots = groupedSlots[period];
          if (!periodSlots || periodSlots.length === 0) return null;

          return (
            <div key={period}>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
                {periodIcons[period]}
                <span>{periodLabels[period]}</span>
                <span className="text-gray-400">({periodSlots.length})</span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {periodSlots.map((slot) => {
                  const isSelected = selectedSlot?.time === slot.time;

                  return (
                    <button
                      key={slot.time}
                      onClick={() => onSlotSelect(slot)}
                      className={`py-3 px-2 rounded-lg text-center transition-all ${
                        isSelected
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-gray-50 text-gray-700 hover:bg-gray-100 active:bg-gray-200'
                      }`}
                    >
                      <div className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                        {slot.time}
                      </div>
                      <div className={`text-xs mt-0.5 ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>
                        {t.maxHours} {slot.maxHours}{{ en: 'h', th: ' ' + t.hours, ja: '時間', zh: '小时' }[language]}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
