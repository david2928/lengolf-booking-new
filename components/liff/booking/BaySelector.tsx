'use client';

import { Language } from '@/lib/liff/translations';
import { bookingTranslations } from '@/lib/liff/booking-translations';
import { BayType } from '@/lib/bayConfig';

interface BaySelectorProps {
  language: Language;
  selectedBay: BayType | null;
  onBaySelect: (bay: BayType | null) => void;
}

export default function BaySelector({
  language,
  selectedBay,
  onBaySelect
}: BaySelectorProps) {
  const t = bookingTranslations[language];

  const bayOptions: { value: BayType | null; label: string; description: string; icon: JSX.Element; color: string }[] = [
    {
      value: null,
      label: t.anyBay,
      description: language === 'en' ? "We'll assign the best available bay" : 'เราจะจัดเบย์ที่ว่างที่ดีที่สุดให้',
      color: 'primary',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      )
    },
    {
      value: 'social',
      label: t.socialBay,
      description: language === 'en' ? 'Great for groups & beginners • 3 bays' : 'เหมาะสำหรับกลุ่มและผู้เริ่มต้น • 3 เบย์',
      color: 'green',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      )
    },
    {
      value: 'ai_lab',
      label: t.aiLab,
      description: language === 'en' ? 'AI swing analysis • Best for 1-2 players' : 'วิเคราะห์วงสวิงด้วย AI • เหมาะสำหรับ 1-2 คน',
      color: 'purple',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )
    }
  ];

  const getColorClasses = (color: string, isSelected: boolean) => {
    if (!isSelected) {
      return {
        border: 'border-gray-200 hover:border-gray-300',
        bg: 'bg-white',
        iconBg: 'bg-gray-100',
        iconText: 'text-gray-500',
        text: 'text-gray-900',
        radio: 'border-gray-300'
      };
    }

    switch (color) {
      case 'green':
        return {
          border: 'border-green-500',
          bg: 'bg-green-50',
          iconBg: 'bg-green-500',
          iconText: 'text-white',
          text: 'text-green-700',
          radio: 'border-green-500 bg-green-500'
        };
      case 'purple':
        return {
          border: 'border-purple-500',
          bg: 'bg-purple-50',
          iconBg: 'bg-purple-500',
          iconText: 'text-white',
          text: 'text-purple-700',
          radio: 'border-purple-500 bg-purple-500'
        };
      default:
        return {
          border: 'border-primary',
          bg: 'bg-primary/10',
          iconBg: 'bg-primary',
          iconText: 'text-white',
          text: 'text-primary',
          radio: 'border-primary bg-primary'
        };
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">{t.bayPreference}</h2>
        <a
          href="/bay-info"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {language === 'en' ? "What's the difference?" : 'ความแตกต่าง?'}
        </a>
      </div>

      <div className="space-y-2">
        {bayOptions.map((option) => {
          const isSelected = selectedBay === option.value;
          const colors = getColorClasses(option.color, isSelected);

          return (
            <button
              key={option.value ?? 'any'}
              onClick={() => onBaySelect(option.value)}
              className={`w-full p-4 rounded-lg text-left transition-all flex items-center gap-4 border-2 ${colors.border} ${colors.bg}`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${colors.iconBg}`}>
                <div className={colors.iconText}>
                  {option.icon}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold ${colors.text}`}>
                  {option.label}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{option.description}</div>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${colors.radio}`}>
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
