import { specialPackages } from '@/lib/liff/coaching-data';
import { Language, coachingTranslations } from '@/lib/liff/translations';

interface SpecialPackagesProps {
  language: Language;
}

export default function SpecialPackages({ language }: SpecialPackagesProps) {
  const t = coachingTranslations[language];

  const formatPrice = (price: number) => {
    return `฿${price.toLocaleString()}`;
  };

  return (
    <section className="mb-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{t.specialPackages}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {specialPackages.map((pkg) => (
          <div
            key={pkg.id}
            className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg shadow-md p-5 border-2 border-green-200"
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-bold text-green-900">{pkg.name[language]}</h3>
              <span className="bg-green-600 text-white text-xs font-semibold px-2 py-1 rounded-full">
                {language === 'en' ? 'SPECIAL' : 'พิเศษ'}
              </span>
            </div>

            <p className="text-green-800 font-medium mb-3">{pkg.description[language]}</p>

            {/* Pricing */}
            <div className="mb-3">
              {pkg.prices.golfers1 && (
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-gray-700">1 {t.golfer}:</span>
                  <span className="text-lg font-bold text-green-900">
                    {formatPrice(pkg.prices.golfers1)}
                  </span>
                </div>
              )}
              {pkg.prices.golfers2 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-700">2 {t.golfers}:</span>
                  <span className="text-lg font-bold text-green-900">
                    {formatPrice(pkg.prices.golfers2)}
                  </span>
                </div>
              )}
            </div>

            {/* Includes */}
            <div className="mb-3">
              <ul className="text-sm text-gray-700 space-y-1">
                {pkg.includes[language].map((item, index) => (
                  <li key={index} className="flex items-start">
                    <svg
                      className="w-4 h-4 text-green-600 mr-2 mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Validity */}
            <div className="text-xs text-gray-600 border-t border-green-200 pt-2">
              {t.validity}: {pkg.validity[language]}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
