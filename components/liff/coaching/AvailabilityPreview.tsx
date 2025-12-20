import { useState } from 'react';
import { coaches, getCoachById } from '@/lib/liff/coaching-data';
import { Language, coachingTranslations } from '@/lib/liff/translations';

interface CoachAvailability {
  id: string;
  name: string;
  displayName: string;
  availability: Array<{
    date: string;
    dayOfWeek: number;
    slots: string[];
    isToday: boolean;
    scheduleStart: string | null;
    scheduleEnd: string | null;
  }>;
}

interface AvailabilityPreviewProps {
  language: Language;
  availability: CoachAvailability[];
}

export default function AvailabilityPreview({ language, availability }: AvailabilityPreviewProps) {
  const [activeCoachId, setActiveCoachId] = useState<string>(coaches[0]?.id || '');
  const t = coachingTranslations[language];

  const activeCoachData = coaches.find((c) => c.id === activeCoachId);
  // Match by displayName since API returns different UUIDs
  const activeAvailability = availability.find((a) =>
    a.displayName === activeCoachData?.displayName ||
    a.name === activeCoachData?.displayName
  );

  // Filter availability to only show slots 5+ hours from now
  const filterAvailabilitySlots = (avail: CoachAvailability | undefined) => {
    if (!avail) return null;

    const now = new Date();
    const bangkokTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const currentHour = bangkokTime.getHours();
    const today = bangkokTime.toISOString().split('T')[0];
    const minHour = currentHour + 5; // 5 hour buffer

    return {
      ...avail,
      availability: avail.availability
        .map((day) => {
          // If it's today, filter out slots within the next 5 hours
          if (day.date === today) {
            const filteredSlots = day.slots.filter((slot) => {
              const slotHour = parseInt(slot.split(':')[0]);
              return slotHour >= minHour;
            });
            return { ...day, slots: filteredSlots };
          }
          // For future days, keep all slots
          return day;
        })
        .filter((day) => day.slots.length > 0), // Only show days with available slots
    };
  };

  const filteredAvailability = filterAvailabilitySlots(activeAvailability);

  const formatDate = (dateString: string, isToday: boolean) => {
    const date = new Date(dateString);
    const dayNames = [
      t.sunday,
      t.monday,
      t.tuesday,
      t.wednesday,
      t.thursday,
      t.friday,
      t.saturday,
    ];

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');

    if (isToday) {
      return `${t.today} (${dayNames[date.getDay()]})`;
    }

    return `${dayNames[date.getDay()]} ${day}/${month}`;
  };

  return (
    <section id="availability-section" className="mb-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{t.availability}</h2>

      {/* Coach Tabs */}
      <div className="flex overflow-x-auto gap-2 mb-4 pb-2">
        {coaches.map((coach) => (
          <button
            key={coach.id}
            onClick={() => setActiveCoachId(coach.id)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
              activeCoachId === coach.id
                ? 'text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            style={
              activeCoachId === coach.id
                ? { backgroundColor: coach.color }
                : undefined
            }
          >
            PRO {coach.displayName}
          </button>
        ))}
      </div>

      {/* Availability Content */}
      <div className="bg-white rounded-lg shadow-md p-4">
        {!filteredAvailability || filteredAvailability.availability.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg
              className="w-16 h-16 mx-auto mb-3 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p>{t.noAvailability}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAvailability.availability.map((day, index) => (
              <div key={index} className="border-b border-gray-200 last:border-0 pb-4 last:pb-0">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold text-gray-900">
                    {formatDate(day.date, day.isToday)}
                  </h4>
                  <span className="text-xs text-green-600 font-medium">
                    {day.slots.length} {language === 'en' ? 'slots' : 'ช่วง'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {day.slots.map((slot, slotIndex) => (
                    <span
                      key={slotIndex}
                      className="text-sm px-3 py-1 rounded-md bg-green-50 text-green-700 border border-green-200"
                    >
                      {slot}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Note */}
      <p className="text-xs text-gray-500 mt-3 text-center">
        {language === 'en'
          ? 'Showing availability for the next 14 days (5+ hours from now). Contact us for same-day bookings.'
          : 'แสดงตารางว่าง 14 วันข้างหน้า (5 ชม.+ จากตอนนี้) ติดต่อเราสำหรับการจองวันนี้'}
      </p>
    </section>
  );
}
