'use client';

import { useEffect, useState } from 'react';
import { Language, bayRatesTranslations } from '@/lib/liff/translations';
import { bayRatesConfig } from '@/lib/liff/bay-rates-data';
import { getBusinessHoursStatus } from '@/lib/businessHours';

interface OperatingHoursProps {
  language: Language;
}

export default function OperatingHours({ language }: OperatingHoursProps) {
  const t = bayRatesTranslations[language];
  const [isOpen, setIsOpen] = useState<boolean>(false);

  useEffect(() => {
    const updateStatus = () => {
      const status = getBusinessHoursStatus();
      setIsOpen(status.isOpen);
    };

    updateStatus();
    const interval = setInterval(updateStatus, 60000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
      <div className="flex items-center gap-2 text-primary mb-3">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 className="text-xl font-bold text-gray-900">{t.operatingHours}</h2>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-gray-600 text-sm">
            {bayRatesConfig.operatingHours.weekday.days[language]}
          </span>
          <span className="font-semibold text-gray-900">
            {bayRatesConfig.operatingHours.weekday.open} - {bayRatesConfig.operatingHours.weekday.close}
          </span>
        </div>

        <div className="pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isOpen ? 'bg-primary' : 'bg-red-500'}`}></div>
            <span className={`font-medium ${isOpen ? 'text-primary' : 'text-red-700'}`}>
              {isOpen ? t.currentlyOpen : t.currentlyClosed}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
