'use client';

import { useState } from 'react';
import { format, addDays } from 'date-fns';
import { th, enUS } from 'date-fns/locale';
import Image from 'next/image';
import {
  CalendarIcon,
  ClockIcon,
  SunIcon,
  UserGroupIcon,
  ShoppingBagIcon,
} from '@heroicons/react/24/outline';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { useTranslations } from 'next-intl';
import { useI18nRouter } from '@/lib/i18n/navigation';

interface DateSelectionProps {
  onDateSelect: (date: Date) => void;
}

export function DateSelection({ onDateSelect }: DateSelectionProps) {
  const t = useTranslations('vip');
  const tBooking = useTranslations('booking');
  const { getCurrentLocale } = useI18nRouter();
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showFacilityInfo, setShowFacilityInfo] = useState(false);

  const formatDateLong = (date: Date) => {
    const locale = getCurrentLocale();
    const dateLocale = locale === 'th' ? th : enUS;
    return format(date, 'do MMMM yyyy', { locale: dateLocale });
  };

  return (
    <div className="w-full px-2 sm:px-4 space-y-8">
      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Today Card */}
        <button
          onClick={() => onDateSelect(today)}
          className="bg-white border-2 border-gray-200 rounded-xl hover:border-green-500 hover:shadow-lg transition-all duration-300 text-left w-full min-w-full"
        >
          <div className="flex items-start p-4 sm:p-6">
            <div className="bg-green-50 p-2 rounded-full shrink-0">
              <ClockIcon className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-3 leading-normal">
              <div className="text-lg sm:text-xl font-bold text-green-800">{t('today')}</div>
              <div className="text-gray-600">{formatDateLong(today)}</div>
            </div>
          </div>
        </button>

        {/* Tomorrow Card */}
        <button
          onClick={() => onDateSelect(tomorrow)}
          className="bg-white border-2 border-gray-200 rounded-xl hover:border-green-500 hover:shadow-lg transition-all duration-300 text-left w-full min-w-full"
        >
          <div className="flex items-start p-4 sm:p-6">
            <div className="bg-green-50 p-2 rounded-full shrink-0">
              <SunIcon className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-3 leading-normal">
              <div className="text-lg sm:text-xl font-bold text-green-800">{t('tomorrow')}</div>
              <div className="text-gray-600">{formatDateLong(tomorrow)}</div>
            </div>
          </div>
        </button>

        {/* Custom Date Card */}
        <button
          onClick={() => setShowCalendar(true)}
          className="bg-white border-2 border-gray-200 rounded-xl hover:border-green-500 hover:shadow-lg transition-all duration-300 text-left w-full min-w-full"
        >
          <div className="flex items-start p-4 sm:p-6">
            <div className="bg-green-50 p-2 rounded-full shrink-0">
              <CalendarIcon className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-3 leading-normal">
              <div className="text-lg sm:text-xl font-bold text-green-800">{tBooking('selectDate')}</div>
              <div className="text-gray-600">{t('chooseAnotherDate')}</div>
            </div>
          </div>
        </button>
      </div>

      {/* Facility Information - Mobile Version */}
      <div className="lg:hidden">
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
          <button
            onClick={() => setShowFacilityInfo(!showFacilityInfo)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center">
              <div className="bg-blue-100 p-2 rounded-full">
                <ShoppingBagIcon className="h-5 w-5 text-blue-600" />
              </div>
              <div className="ml-3">
                <div className="text-base font-semibold text-blue-800 text-left">{t('facilityInformation')}</div>
                <div className="text-sm text-blue-600 text-left">{t('hoursAmenitiesMenus')}</div>
              </div>
            </div>
            <div className={`transform transition-transform duration-300 ${showFacilityInfo ? 'rotate-180' : ''}`}>
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
        </div>

        {showFacilityInfo && (
          <div className="mt-4 bg-gray-50 border-2 border-gray-200 rounded-xl p-4 space-y-4 animate-in slide-in-from-top-2 duration-300">
            {/* Opening Hours */}
            <div className="bg-white rounded-lg p-3 shadow-sm">
              <div className="flex items-start">
                <div className="bg-green-50 p-1.5 rounded-full shrink-0">
                  <ClockIcon className="h-4 w-4 text-green-600" />
                </div>
                <div className="ml-3">
                  <p className="font-medium text-gray-900 mb-1">{t('openingHours')}</p>
                  <p className="text-sm text-gray-600">{t('dailySchedule')}</p>
                  <p className="text-xs text-gray-500">{t('peakHours')}</p>
                </div>
              </div>
            </div>

            {/* Bay Capacity */}
            <div className="bg-white rounded-lg p-3 shadow-sm">
              <div className="flex items-start">
                <div className="bg-green-50 p-1.5 rounded-full shrink-0">
                  <UserGroupIcon className="h-4 w-4 text-green-600" />
                </div>
                <div className="ml-3">
                  <p className="font-medium text-gray-900 mb-1">{t('bayCapacity')}</p>
                  <p className="text-sm text-gray-600">{t('upToFivePlayersBay')}</p>
                  <p className="text-xs text-gray-500">{t('perfectForGroups')}</p>
                </div>
              </div>
            </div>

            {/* Facilities */}
            <div className="bg-white rounded-lg p-3 shadow-sm">
              <div className="flex items-start">
                <div className="bg-green-50 p-1.5 rounded-full shrink-0">
                  <ShoppingBagIcon className="h-4 w-4 text-green-600" />
                </div>
                <div className="ml-3">
                  <p className="font-medium text-gray-900 mb-2">{t('facilitiesEquipment')}</p>
                  <div className="space-y-1 text-sm text-gray-600">
                    <p>• {t('professionalClubsComplimentary')}</p>
                    <p>• {t('clubStorageRegular')}</p>
                    <p>• {t('golfGlovesShop')}</p>
                    <p>• {t('foodBeverages')} (<a href="/images/food_menu.jpg" target="_blank" className="text-green-600 hover:text-green-700 underline font-medium">{t('foodMenu')}</a> | <a href="/images/drink_menu.jpg" target="_blank" className="text-green-600 hover:text-green-700 underline font-medium">{t('drinkMenu')}</a>)</p>
                    <p>• {t('spaciousPuttingGreen')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Image Preview */}
            <div className="grid grid-cols-2 gap-2">
              <div className="relative h-24 rounded-lg overflow-hidden">
                <Image
                  src="/images/pic2.png"
                  alt="LENGOLF Bay"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 200px"
                />
              </div>
              <div className="relative h-24 rounded-lg overflow-hidden">
                <Image
                  src="/images/pic1.png"
                  alt="LENGOLF Facility"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 200px"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Facility Information - Desktop Version */}
      <div className="hidden lg:block bg-gray-50 border-2 border-gray-300 rounded-xl p-6">
        <div className="grid grid-cols-5 gap-6">
          <div className="col-span-3 space-y-5">
            <h3 className="text-xl font-bold text-green-800 mb-6">{t('facilityInformation')}</h3>
            
            {/* Opening Hours Section */}
            <div className="space-y-2">
              <div className="flex items-start">
                <div className="bg-green-50 p-1.5 rounded-full shrink-0">
                  <ClockIcon className="h-4 w-4 text-green-600" />
                </div>
                <div className="ml-3 text-gray-600 leading-normal">
                  <p><span className="font-medium">{t('openingHoursDaily')}</span></p>
                  <p className="text-sm text-gray-500">{t('peakHoursDetail')}</p>
                  <p className="text-sm text-gray-500">{t('lastBooking')}</p>
                </div>
              </div>
            </div>

            {/* Bay Capacity Section */}
            <div className="space-y-2">
              <div className="flex items-start">
                <div className="bg-green-50 p-1.5 rounded-full shrink-0">
                  <UserGroupIcon className="h-4 w-4 text-green-600" />
                </div>
                <div className="ml-3 text-gray-600 leading-normal">
                  <p><span className="font-medium">{t('bayCapacityDetail')}</span></p>
                  <p className="text-sm text-gray-500">{t('perfectForGroupsDetail')}</p>
                  <p className="text-sm text-gray-500">{t('professionalCoaching')}</p>
                </div>
              </div>
            </div>

            {/* Equipment Section */}
            <div className="space-y-2">
              <div className="flex items-start">
                <div className="bg-green-50 p-1.5 rounded-full shrink-0">
                  <ShoppingBagIcon className="h-4 w-4 text-green-600" />
                </div>
                <div className="ml-3 text-gray-600 leading-normal">
                  <p><span className="font-medium">{t('facilitiesEquipmentDetail')}</span></p>
                  <ul className="mt-1 space-y-1">
                    <li>• {t('professionalClubsAvailable')}</li>
                    <li>• {t('dedicatedClubStorage')}</li>
                    <li>• {t('professionalGolfGloves')}</li>
                    <li>• {t('foodBeveragesService')} (<a href="/images/food_menu.jpg" target="_blank" className="text-green-600 hover:text-green-700 underline">{t('foodMenuLink')}</a> | <a href="/images/drink_menu.jpg" target="_blank" className="text-green-600 hover:text-green-700 underline">{t('drinkMenuLink')}</a>)</li>
                    <li>• {t('spaciousPuttingGreenFree')}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Images Section */}
          <div className="col-span-2 grid grid-rows-2 gap-4">
            <div className="relative w-full h-44 rounded-lg overflow-hidden">
              <Image
                src="/images/pic2.png"
                alt="LENGOLF Bay"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 400px"
                priority
              />
            </div>
            <div className="relative w-full h-44 rounded-lg overflow-hidden">
              <Image
                src="/images/pic1.png"
                alt="LENGOLF Facility"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 400px"
                priority
              />
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Modal */}
      {showCalendar && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowCalendar(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{tBooking('selectDateModal')}</h3>
                <p className="text-sm text-gray-500 mt-1">{t('choosePreferredDate')}</p>
              </div>
              <button
                onClick={() => setShowCalendar(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <style jsx global>{`
              .rdp {
                --rdp-cell-size: 40px;
                --rdp-accent-color: rgb(22 163 74) !important;
                --rdp-background-color: rgb(220 252 231) !important;
                --rdp-accent-color-dark: rgb(21 128 61) !important;
                --rdp-background-color-dark: rgb(220 252 231) !important;
                --rdp-outline: 2px solid var(--rdp-accent-color) !important;
                --rdp-outline-selected: 2px solid rgb(22 163 74) !important;
                margin: 0;
              }

              .rdp-button:focus-visible:not([disabled]) {
                outline: none;
              }

              .rdp-day_today {
                background: none !important;
                color: rgb(22 163 74) !important;
                font-weight: bold !important;
                border: 2px solid rgb(22 163 74) !important;
              }

              .rdp-day_selected:not([disabled]),
              .rdp-day_selected:focus:not([disabled]),
              .rdp-day_selected:active:not([disabled]),
              .rdp-day_selected:hover:not([disabled]) {
                color: white !important;
                background-color: rgb(22 163 74) !important;
                border-color: rgb(22 163 74) !important;
              }

              .rdp-day:hover:not([disabled]):not(.rdp-day_selected) {
                color: rgb(22 163 74) !important;
                background-color: rgb(220 252 231) !important;
              }

              .rdp-nav_button {
                color: rgb(22 163 74) !important;
              }
              .rdp-nav_button:hover,
              .rdp-nav_button:focus-visible {
                color: rgb(22 163 74) !important;
                background-color: rgb(220 252 231) !important;
              }

              .rdp-nav button svg {
                fill: rgb(22 163 74) !important;
              }

              .rdp-button_reset {
                color: inherit !important;
              }

              .rdp-day {
                color: inherit !important;
              }

              .rdp-day_today.rdp-day_selected {
                color: white !important;
              }

              .rdp-day_disabled,
              .rdp-day_disabled:hover {
                color: rgb(156 163 175) !important;
                cursor: not-allowed !important;
                background-color: rgb(243 244 246) !important;
                opacity: 0.5;
              }

              .rdp-day_disabled.rdp-day_today {
                border-color: rgb(156 163 175) !important;
              }
            `}</style>

            <DayPicker
              mode="single"
              onSelect={(date) => {
                if (date) {
                  onDateSelect(date);
                  setShowCalendar(false);
                }
              }}
              fromDate={today}
              disabled={[{ before: today }]}
              modifiers={{ today: new Date() }}
              className="mx-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}
