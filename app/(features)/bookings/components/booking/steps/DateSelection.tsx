'use client';

import { useState } from 'react';
import { format, addDays } from 'date-fns';
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

interface DateSelectionProps {
  onDateSelect: (date: Date) => void;
}

export function DateSelection({ onDateSelect }: DateSelectionProps) {
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const [showCalendar, setShowCalendar] = useState(false);

  const formatDateLong = (date: Date) => format(date, 'do MMMM yyyy');

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-8">
      {/* Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today Card */}
        <button
          onClick={() => onDateSelect(today)}
          className="bg-white border-2 border-gray-200 rounded-xl hover:border-green-500 hover:shadow-lg transition-all duration-300 text-left"
        >
          <div className="flex items-start p-4">
            <div className="bg-green-50 p-2 rounded-full shrink-0">
              <ClockIcon className="h-5 w-5 text-green-600" />
            </div>
            <div className="ml-3 leading-normal">
              <div className="text-xl font-bold text-green-800">Today</div>
              <div className="text-gray-600">{formatDateLong(today)}</div>
            </div>
          </div>
        </button>

        {/* Tomorrow Card */}
        <button
          onClick={() => onDateSelect(tomorrow)}
          className="bg-white border-2 border-gray-200 rounded-xl hover:border-green-500 hover:shadow-lg transition-all duration-300 text-left"
        >
          <div className="flex items-start p-4">
            <div className="bg-green-50 p-2 rounded-full shrink-0">
              <SunIcon className="h-5 w-5 text-green-600" />
            </div>
            <div className="ml-3 leading-normal">
              <div className="text-xl font-bold text-green-800">Tomorrow</div>
              <div className="text-gray-600">{formatDateLong(tomorrow)}</div>
            </div>
          </div>
        </button>

        {/* Custom Date Card */}
        <button
          onClick={() => setShowCalendar(true)}
          className="bg-white border-2 border-gray-200 rounded-xl hover:border-green-500 hover:shadow-lg transition-all duration-300 text-left"
        >
          <div className="flex items-start p-4">
            <div className="bg-green-50 p-2 rounded-full shrink-0">
              <CalendarIcon className="h-5 w-5 text-green-600" />
            </div>
            <div className="ml-3 leading-normal">
              <div className="text-xl font-bold text-green-800">Select Date</div>
              <div className="text-gray-600">Choose another date</div>
            </div>
          </div>
        </button>
      </div>

      {/* Facility Information (hidden on mobile) */}
      <div className="hidden lg:block bg-gray-50 border-2 border-gray-300 rounded-xl p-6">
        <div className="grid grid-cols-5 gap-6">
          <div className="col-span-3 space-y-5">
            <h3 className="text-xl font-bold text-green-800 mb-6">Facility Information</h3>
            
            {/* Opening Hours Section */}
            <div className="space-y-2">
              <div className="flex items-start">
                <div className="bg-green-50 p-1.5 rounded-full shrink-0">
                  <ClockIcon className="h-4 w-4 text-green-600" />
                </div>
                <div className="ml-3 text-gray-600 leading-normal">
                  <p><span className="font-medium">Opening Hours:</span> 10:00 AM - 11:00 PM daily</p>
                  <p className="text-sm text-gray-500">Peak Hours: 6:00 PM - 9:00 PM</p>
                  <p className="text-sm text-gray-500">Last booking: 10:00 PM (1-hour session)</p>
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
                  <p><span className="font-medium">Bay Capacity:</span> Up to 5 players per bay</p>
                  <p className="text-sm text-gray-500">Perfect for groups, friends, and family</p>
                  <p className="text-sm text-gray-500">Professional coaching available upon request</p>
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
                  <p><span className="font-medium">Facilities & Equipment:</span></p>
                  <ul className="mt-1 space-y-1">
                    <li>• Professional golf clubs available complimentary</li>
                    <li>• Dedicated club storage for regular players</li>
                    <li>• Professional golf gloves available in our shop</li>
                    <li>• Food & beverages service available</li>
                    <li>• Spacious putting green free for all visitors</li>
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
                <h3 className="text-xl font-bold text-gray-900">Select Date</h3>
                <p className="text-sm text-gray-500 mt-1">Choose your preferred date</p>
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
