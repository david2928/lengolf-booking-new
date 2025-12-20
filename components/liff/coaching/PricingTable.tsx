import { lessonPackages, packageIncludes } from '@/lib/liff/coaching-data';
import { Language, coachingTranslations } from '@/lib/liff/translations';

interface PricingTableProps {
  language: Language;
}

export default function PricingTable({ language }: PricingTableProps) {
  const t = coachingTranslations[language];

  const formatPrice = (price: number) => {
    return `฿${price.toLocaleString()}`;
  };

  return (
    <section className="mb-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{t.lessonPackages}</h2>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  {t.lessonPackages}
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                  1 {t.golfer}
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                  2 {t.golfers}
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                  {t.golfers3to5}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {lessonPackages.map((pkg) => (
                <tr key={pkg.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{pkg.label[language]}</div>
                    {pkg.validity && (
                      <div className="text-xs text-gray-500">
                        {t.validity}: {pkg.validity[language]}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-900">
                    {formatPrice(pkg.prices.golfers1)}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-900">
                    {formatPrice(pkg.prices.golfers2)}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-900">
                    {formatPrice(pkg.prices.golfers3to5)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* What's Included */}
        <div className="border-t border-gray-200 bg-green-50 px-4 py-3">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">{t.packageIncludes}</h4>
          <ul className="text-sm text-gray-700 space-y-1">
            {packageIncludes[language].map((item, index) => (
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
      </div>
    </section>
  );
}
