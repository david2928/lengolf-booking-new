import { coaches } from '@/lib/liff/coaching-data';
import { Language, coachingTranslations } from '@/lib/liff/translations';
import CoachCard from './CoachCard';

interface CoachListProps {
  language: Language;
}

export default function CoachList({ language }: CoachListProps) {
  const t = coachingTranslations[language];

  const scrollToAvailability = () => {
    const availabilitySection = document.getElementById('availability-section');
    if (availabilitySection) {
      availabilitySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section className="mb-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{t.ourCoaches}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {coaches.map((coach) => (
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
