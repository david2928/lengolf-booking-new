import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';

interface ProfileCardProps {
  profile: {
    name: string | null;
    pictureUrl?: string | null;
    email?: string | null;
    phone?: string | null;
    customerCode?: string;
  };
  language: Language;
}

export default function ProfileCard({ profile, language }: ProfileCardProps) {
  const t = membershipTranslations[language];

  return (
    <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0">
          {profile.pictureUrl ? (
            <img
              src={profile.pictureUrl}
              alt={profile.name || ''}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          )}
        </div>

        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-900">{profile.name}</h2>
          {profile.customerCode && (
            <p className="text-sm text-gray-600">
              {t.customerCode}: <span className="font-medium text-primary">{profile.customerCode}</span>
            </p>
          )}
          {profile.phone && (
            <p className="text-xs text-gray-500 mt-1">
              {t.phone}: {profile.phone}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
