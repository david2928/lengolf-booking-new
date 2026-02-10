'use client';

import { useEffect, useState } from 'react';
import { Language, bayRatesTranslations } from '@/lib/liff/translations';
import { getCurrentRate } from '@/lib/liff/bay-rates-data';
import { getBusinessHoursStatus } from '@/lib/businessHours';

interface CurrentTimeIndicatorProps {
  language: Language;
}

export default function CurrentTimeIndicator({ language }: CurrentTimeIndicatorProps) {
  const t = bayRatesTranslations[language];
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  useEffect(() => {
    const updateCurrentInfo = () => {
      const { price } = getCurrentRate();
      const status = getBusinessHoursStatus();
      setCurrentPrice(price);
      setIsOpen(status.isOpen);
    };

    updateCurrentInfo();
    const interval = setInterval(updateCurrentInfo, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-gray-600 mb-1">{t.currentRate}</h2>
          {currentPrice !== null ? (
            <div className="text-2xl font-bold text-primary">
              ฿{currentPrice.toLocaleString()}{t.perHour}
            </div>
          ) : (
            <div className="text-lg text-gray-500">
              {{ en: 'Closed', th: 'ปิดทำการ', ja: '営業時間外', zh: '已打烊' }[language]}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isOpen ? 'bg-primary' : 'bg-red-500'}`}></div>
          <span className="text-sm font-medium text-gray-600">
            {isOpen ? t.currentlyOpen : t.currentlyClosed}
          </span>
        </div>
      </div>
    </div>
  );
}
