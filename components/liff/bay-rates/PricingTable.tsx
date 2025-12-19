'use client';

import { useEffect, useState } from 'react';
import { Language, bayRatesTranslations } from '@/lib/liff/translations';
import { timeSlots, rates, bayRatesConfig, getCurrentTimeSlot } from '@/lib/liff/bay-rates-data';

interface PricingTableProps {
  language: Language;
}

export default function PricingTable({ language }: PricingTableProps) {
  const t = bayRatesTranslations[language];
  const [currentSlotId, setCurrentSlotId] = useState<string | null>(null);

  useEffect(() => {
    const updateCurrentSlot = () => {
      const { slot } = getCurrentTimeSlot();
      setCurrentSlotId(slot?.id || null);
    };

    updateCurrentSlot();
    const interval = setInterval(updateCurrentSlot, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-100 overflow-hidden">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#2D5A27] text-white">
              <th className="px-4 py-3 text-left text-sm font-semibold">{t.time}</th>
              <th className="px-4 py-3 text-center text-sm font-semibold">
                {t.weekday}
                <div className="text-xs font-normal opacity-90">
                  {bayRatesConfig.operatingHours.weekday.days[language]}
                </div>
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold">
                {t.weekend}
                <div className="text-xs font-normal opacity-90">
                  {bayRatesConfig.operatingHours.weekend.days[language]}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((slot) => {
              const rate = rates.find((r) => r.timeSlotId === slot.id);
              const isCurrentSlot = slot.id === currentSlotId;

              return (
                <tr
                  key={slot.id}
                  className={`border-b border-gray-100 ${
                    isCurrentSlot ? 'bg-green-50' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 whitespace-nowrap">{slot.label[language]}</span>
                      {slot.isPromo && (
                        <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-bold whitespace-nowrap">
                          {t.promo}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {rate && (
                      <div>
                        <div className="font-bold text-gray-900">
                          ฿{rate.weekdayPrice.toLocaleString()}
                        </div>
                        {rate.originalWeekdayPrice && (
                          <div className="text-sm text-red-500 line-through">
                            ฿{rate.originalWeekdayPrice.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {rate && (
                      <div>
                        <div className="font-bold text-gray-900">
                          ฿{rate.weekendPrice.toLocaleString()}
                        </div>
                        {rate.originalWeekendPrice && (
                          <div className="text-sm text-red-500 line-through">
                            ฿{rate.originalWeekendPrice.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Notes */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 space-y-1">
        <p className="text-sm text-gray-600">{bayRatesConfig.rateNote[language]}</p>
        <p className="text-sm text-gray-600">{bayRatesConfig.appointmentNote[language]}</p>
      </div>
    </div>
  );
}
