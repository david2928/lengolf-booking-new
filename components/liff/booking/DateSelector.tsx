'use client';

import { useState } from 'react';
import { Language } from '@/lib/liff/translations';
import { bookingTranslations } from '@/lib/liff/booking-translations';
import { format, addDays, isToday, isTomorrow } from 'date-fns';
import { th, enUS } from 'date-fns/locale';

interface DateSelectorProps {
  language: Language;
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
}

export default function DateSelector({
  language,
  selectedDate,
  onDateSelect
}: DateSelectorProps) {
  const t = bookingTranslations[language];
  const [showCalendar, setShowCalendar] = useState(false);
  const locale = language === 'th' ? th : enUS;

  const today = new Date();

  // Generate next 4 days
  const dates = Array.from({ length: 4 }, (_, i) => addDays(today, i));

  const getDayLabel = (date: Date, index: number) => {
    if (isToday(date)) return t.today;
    if (isTomorrow(date)) return t.tomorrow;
    return format(date, 'EEE', { locale });
  };

  const isSelected = (date: Date) => {
    if (!selectedDate) return false;
    return format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
  };

  return (
    <div className="space-y-4">
      {/* Main Date Selection Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <h2 className="text-base font-semibold text-gray-900 mb-4">{t.selectDate}</h2>

        {/* 4 Day Grid */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {dates.map((date, index) => {
            const selected = isSelected(date);
            const isFirstTwo = index < 2;

            return (
              <button
                key={index}
                onClick={() => onDateSelect(date)}
                className={`p-3 rounded-xl text-center transition-all ${
                  selected
                    ? 'bg-primary text-white shadow-lg ring-2 ring-primary ring-offset-2'
                    : isFirstTwo
                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className={`text-[10px] font-semibold uppercase ${selected ? 'text-white/80' : isFirstTwo ? 'text-primary/70' : 'text-gray-500'}`}>
                  {getDayLabel(date, index)}
                </div>
                <div className="text-2xl font-bold mt-0.5">
                  {format(date, 'd')}
                </div>
                <div className={`text-[10px] ${selected ? 'text-white/70' : 'text-gray-400'}`}>
                  {format(date, 'MMM', { locale })}
                </div>
              </button>
            );
          })}
        </div>

        {/* Other Date Button */}
        <button
          onClick={() => setShowCalendar(!showCalendar)}
          className={`w-full py-3 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            selectedDate && !dates.some(d => format(d, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd'))
              ? 'bg-primary text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {selectedDate && !dates.some(d => format(d, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd'))
            ? format(selectedDate, 'EEEE, MMM d', { locale })
            : t.otherDate
          }
        </button>

        {showCalendar && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <input
              type="date"
              min={format(today, 'yyyy-MM-dd')}
              value={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''}
              onChange={(e) => {
                if (e.target.value) {
                  onDateSelect(new Date(e.target.value));
                  setShowCalendar(false);
                }
              }}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        )}
      </div>

      {/* Info Cards - Subtle */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <div className="space-y-4">
          {/* Opening Hours */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3 text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">{language === 'en' ? 'Opening Hours' : 'เวลาเปิดทำการ'}</span>
            </div>
            <span className="text-sm font-medium text-gray-900">{language === 'en' ? '10:00 AM - 11:00 PM' : '10:00 - 23:00 น.'}</span>
          </div>

          {/* Location */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3 text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm">{language === 'en' ? 'Location' : 'สถานที่'}</span>
            </div>
            <a
              href="https://maps.app.goo.gl/QhcvtyaQUej1a4vL8"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary font-medium flex items-center gap-1.5 hover:underline"
            >
              Mercury Ville, {language === 'en' ? 'FL4' : 'ชั้น 4'}
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>

          {/* Parking */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3 text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <span className="text-sm">{language === 'en' ? 'Parking' : 'ที่จอดรถ'}</span>
            </div>
            <span className="text-sm text-green-600 font-medium">{language === 'en' ? 'Free with booking' : 'ฟรีทุกการจอง'}</span>
          </div>
        </div>
      </div>

      {/* Quick Links - 2x2 Grid */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-sm font-semibold text-gray-900">
            {language === 'en' ? 'Quick Links' : 'ลิงก์ด่วน'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <a
            href="/liff/bay-rates"
            className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">
              {language === 'en' ? 'Bay Rates' : 'ราคาเบย์'}
            </span>
          </a>

          <a
            href="/liff/promotions"
            className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <div className="w-10 h-10 bg-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">
              {language === 'en' ? 'Promotions' : 'โปรโมชั่น'}
            </span>
          </a>

          <a
            href="/liff/membership"
            className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">
              {language === 'en' ? 'Membership' : 'สมาชิก'}
            </span>
          </a>

          <a
            href="/liff/contact"
            className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">
              {language === 'en' ? 'Contact Us' : 'ติดต่อเรา'}
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
