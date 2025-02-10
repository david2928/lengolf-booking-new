'use client';

import { useState } from 'react';
import { format, addDays } from 'date-fns';
import { CalendarIcon, ClockIcon, SunIcon, CloudIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

interface DateSelectionProps {
  onDateSelect: (date: Date) => void;
}

export function DateSelection({ onDateSelect }: DateSelectionProps) {
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const dayAfterTomorrow = addDays(today, 2);
  const [showCalendar, setShowCalendar] = useState(false);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Today */}
        <button
          onClick={() => onDateSelect(today)}
          className="p-6 rounded-xl border-2 border-gray-200 bg-white hover:border-green-500 hover:shadow-md transition-all"
        >
          <div className="text-center">
            <div className="inline-block p-3 rounded-full bg-green-100 mb-3">
              <ClockIcon className="h-6 w-6 text-green-800" />
            </div>
            <div className="text-xl font-bold text-green-800">Today</div>
            <div className="text-gray-600 mt-1">{format(today, 'dd MMM yyyy')}</div>
          </div>
        </button>

        {/* Tomorrow */}
        <button
          onClick={() => onDateSelect(tomorrow)}
          className="p-6 rounded-xl border-2 border-gray-200 bg-white hover:border-green-500 hover:shadow-md transition-all"
        >
          <div className="text-center">
            <div className="inline-block p-3 rounded-full bg-green-100 mb-3">
              <SunIcon className="h-6 w-6 text-green-800" />
            </div>
            <div className="text-xl font-bold text-green-800">Tomorrow</div>
            <div className="text-gray-600 mt-1">{format(tomorrow, 'dd MMM yyyy')}</div>
          </div>
        </button>

        {/* Day after tomorrow */}
        <button
          onClick={() => onDateSelect(dayAfterTomorrow)}
          className="p-6 rounded-xl border-2 border-gray-200 bg-white hover:border-green-500 hover:shadow-md transition-all"
        >
          <div className="text-center">
            <div className="inline-block p-3 rounded-full bg-green-100 mb-3">
              <CloudIcon className="h-6 w-6 text-green-800" />
            </div>
            <div className="text-xl font-bold text-green-800">
              {format(dayAfterTomorrow, 'EEEE')}
            </div>
            <div className="text-gray-600 mt-1">{format(dayAfterTomorrow, 'dd MMM yyyy')}</div>
          </div>
        </button>

        {/* Custom date selector */}
        <button
          onClick={() => setShowCalendar(true)}
          className="p-6 rounded-xl border-2 border-gray-200 bg-white hover:border-green-500 hover:shadow-md transition-all"
        >
          <div className="text-center">
            <div className="inline-block p-3 rounded-full bg-green-100 mb-3">
              <CalendarIcon className="h-6 w-6 text-green-800" />
            </div>
            <div className="text-xl font-bold text-green-800">Select Date</div>
            <div className="text-gray-600 mt-1">Custom date</div>
          </div>
        </button>
      </div>

      {/* Calendar Modal */}
      {showCalendar && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" 
          onClick={() => setShowCalendar(false)}
        >
          <div 
            className="bg-white rounded-xl p-4" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">Select Date</h3>
              <button 
                onClick={() => setShowCalendar(false)} 
                className="text-gray-500 hover:text-gray-700"
              >
                <XMarkIcon className="h-6 w-6" />
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

              .rdp-day_today:not(.rdp-day_outside) {
                color: rgb(22 163 74) !important;
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
              selected={undefined}
              onSelect={(date) => {
                if (date) {
                  onDateSelect(date);
                  setShowCalendar(false);
                }
              }}
              fromDate={today}
              disabled={[
                { before: today }
              ]}
              modifiers={{
                today: new Date(),
              }}
              modifiersStyles={{
                disabled: {
                  color: 'rgb(156 163 175) !important',
                  cursor: 'not-allowed',
                  backgroundColor: 'rgb(243 244 246) !important',
                }
              }}
            />
          </div>
        </div>
      )}
    </>
  );
} 