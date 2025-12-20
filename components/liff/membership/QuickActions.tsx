import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';

interface QuickActionsProps {
  language: Language;
}

export default function QuickActions({ language }: QuickActionsProps) {
  const t = membershipTranslations[language];

  const actions = [
    {
      label: t.bookNow,
      href: '/bookings',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: 'bg-primary text-white',
    },
    {
      label: t.viewPromotions,
      href: '/liff/promotions',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
        </svg>
      ),
      color: 'bg-blue-500 text-white',
    },
    {
      label: t.viewBayRates,
      href: '/liff/bay-rates',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      color: 'bg-green-500 text-white',
    },
    {
      label: t.contactUs,
      href: '/liff/contact',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      color: 'bg-gray-600 text-white',
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-900">{t.quickActions}</h2>
      </div>

      <div className="p-4 grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <a
            key={action.label}
            href={action.href}
            className={`flex flex-col items-center gap-2 p-4 rounded-lg ${action.color} hover:opacity-90 active:opacity-80 transition-opacity shadow-sm`}
          >
            <div className="w-10 h-10 flex items-center justify-center">
              {action.icon}
            </div>
            <span className="text-xs font-medium text-center">{action.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
