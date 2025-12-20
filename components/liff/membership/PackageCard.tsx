import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';

interface Package {
  id: string;
  packageName: string;
  packageCategory?: string;
  totalHours?: number | null;
  remainingHours?: number | null;
  usedHours?: number | null;
  expiryDate?: string | null;
  status: string;
}

interface PackageCardProps {
  package: Package;
  language: Language;
}

export default function PackageCard({ package: pkg, language }: PackageCardProps) {
  const t = membershipTranslations[language];

  const isExpired = pkg.status === 'expired';
  const isUnlimited = pkg.totalHours === null || pkg.totalHours === 999999;

  // Calculate progress percentage
  const progressPercentage = isUnlimited
    ? 100
    : pkg.totalHours && pkg.remainingHours !== null && pkg.remainingHours !== undefined
    ? (pkg.remainingHours / pkg.totalHours) * 100
    : 0;

  // Format expiry date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className={`bg-white rounded-lg shadow-md p-4 border ${isExpired ? 'border-gray-300 opacity-60' : 'border-gray-100'}`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h3 className="font-bold text-gray-900 text-base">{pkg.packageName}</h3>
          {pkg.packageCategory && (
            <p className="text-xs text-gray-500 mt-0.5">{pkg.packageCategory}</p>
          )}
        </div>
        {isExpired && (
          <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">
            {t.expired}
          </span>
        )}
        {!isExpired && isUnlimited && (
          <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
            {t.unlimited}
          </span>
        )}
      </div>

      {/* Hours Display */}
      {!isUnlimited && (
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600">
              {pkg.remainingHours !== null ? `${pkg.remainingHours}` : '0'} / {pkg.totalHours || 0} {t.hours}
            </span>
            <span className="text-gray-500 text-xs">
              {Math.round(progressPercentage)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                progressPercentage > 30 ? 'bg-primary' : 'bg-red-500'
              }`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Expiry Date */}
      {pkg.expiryDate && (
        <p className="text-xs text-gray-500">
          {isExpired ? t.expired : t.expires}: {formatDate(pkg.expiryDate)}
        </p>
      )}
    </div>
  );
}
