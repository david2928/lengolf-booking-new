import { Language, bayRatesTranslations } from '@/lib/liff/translations';
import { amenities } from '@/lib/liff/bay-rates-data';

interface AmenitiesProps {
  language: Language;
}

const getIconForType = (icon: string) => {
  switch (icon) {
    case 'clubs':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      );
    case 'storage':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      );
    case 'gloves':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      );
    default:
      return null;
  }
};

const getColorForType = (type: string) => {
  switch (type) {
    case 'free':
      return 'bg-green-100 text-green-600';
    case 'available':
      return 'bg-blue-100 text-blue-600';
    case 'paid':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-600';
  }
};

export default function Amenities({ language }: AmenitiesProps) {
  const t = bayRatesTranslations[language];

  return (
    <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
      <div className="flex items-center gap-2 text-primary mb-3">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
        <h2 className="text-xl font-bold text-gray-900">{t.amenities}</h2>
      </div>

      <div className="space-y-3">
        {amenities.map((amenity) => (
          <div key={amenity.id} className="flex gap-3">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${getColorForType(amenity.type)}`}>
              {getIconForType(amenity.icon)}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900 mb-1">
                {amenity.title[language]}
              </div>
              <div className="text-sm text-gray-600">
                {amenity.description[language]}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
