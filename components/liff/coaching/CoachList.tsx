import { coaches } from '@/lib/liff/coaching-data';
import { Language, coachingTranslations } from '@/lib/liff/translations';
import CoachCard from './CoachCard';

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

interface CoachListProps {
  language: Language;
  availability: CoachAvailability[];
}

export default function CoachList({ language, availability }: CoachListProps) {
  const t = coachingTranslations[language];

  const scrollToAvailability = () => {
    const availabilitySection = document.getElementById('availability-section');
    if (availabilitySection) {
      availabilitySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Filter coaches to only show those with availability
  // API returns English displayName, so match against coach.name
  const availableCoachNames = new Set(
    availability
      .filter((a) => a.availability.some((day) => day.slots.length > 0))
      .map((a) => a.displayName)
  );

  const availableCoaches = coaches.filter((coach) =>
    availableCoachNames.has(coach.name)
  );

  if (availableCoaches.length === 0) {
    return null;
  }

  return (
    <section className="mb-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{t.ourCoaches}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {availableCoaches.map((coach) => (
          <CoachCard
            key={coach.id}
            coach={coach}
            language={language}
            onViewAvailability={scrollToAvailability}
          />
        ))}
      </div>
    </section>
  );
}
