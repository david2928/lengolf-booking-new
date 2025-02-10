'use client';

import { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { 
  CalendarIcon, 
  ClockIcon, 
  ArrowLeftIcon,
  SunIcon,
  MoonIcon,
  CloudIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { TimeSlots } from './components/booking/steps/TimeSlots';
import { BookingDetails } from './components/booking/steps/BookingDetails';
import { Layout } from './components/booking/Layout';
import { PageTransition } from '@/components/shared/PageTransition';

interface TimeSlot {
  startTime: string;
  endTime: string;
  maxHours: number;
  period: 'morning' | 'afternoon' | 'evening';
}

const OPENING_HOUR = 10; // 10:00
const CLOSING_HOUR = 23; // 23:00

export default function BookingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const dayAfterTomorrow = addDays(today, 2);

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [maxDuration, setMaxDuration] = useState<number>(1);

  useEffect(() => {
    const initAuth = async () => {
      const supabase = createClient();
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error || !user) {
        router.push('/auth/login');
        return;
      }

      setUser(user);
    };

    initAuth();
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setCurrentStep(2);
  };

  const handleTimeSelect = (time: string, maxHours: number) => {
    setSelectedTime(time);
    setMaxDuration(maxHours);
    setCurrentStep(3);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      if (currentStep === 2) {
        setSelectedDate(null);
      } else if (currentStep === 3) {
        setSelectedTime(null);
      }
      setCurrentStep(currentStep - 1);
    }
  };

  const renderContent = () => (
    <div className="min-h-[36rem]">
      {/* Page Title and Back Button */}
      <div className="mb-6 flex items-start">
        {currentStep > 1 && (
          <button
            onClick={handleBack}
            className="mr-4 p-2 rounded-lg hover:bg-gray-100"
            aria-label="Go back"
          >
            <ArrowLeftIcon className="h-6 w-6 text-gray-600" />
          </button>
        )}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {currentStep === 1 
              ? 'Select Date'
              : currentStep === 2
              ? 'Select Time'
              : 'Provide Details'
            }
          </h2>
          <p className="text-gray-600 mt-1">
            {currentStep === 1 
              ? 'Choose when you\'d like to play.'
              : currentStep === 2
              ? format(selectedDate!, 'EEE, d MMM yyyy')
              : 'Complete your booking details.'
            }
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative">
        {isLoadingSlots && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 bg-opacity-75">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-4 text-lg text-gray-600">Loading available times...</p>
            </div>
          </div>
        )}

        <div className={isLoadingSlots ? 'opacity-25' : 'opacity-100'}>
          {currentStep === 1 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Today */}
              <button
                onClick={() => handleDateSelect(today)}
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
                onClick={() => handleDateSelect(tomorrow)}
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
                onClick={() => handleDateSelect(dayAfterTomorrow)}
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
          )}

          {currentStep === 2 && selectedDate && (
            <TimeSlots
              selectedDate={selectedDate}
              onTimeSelect={handleTimeSelect}
              onBack={handleBack}
            />
          )}

          {currentStep === 3 && selectedDate && selectedTime && user && (
            <BookingDetails
              user={user}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              maxDuration={maxDuration}
              onBack={handleBack}
            />
          )}
        </div>
      </div>
    </div>
  );

  return (
    <Layout>
      {user && (
        <PageTransition>
          {renderContent()}
        </PageTransition>
      )}

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

              /* Hide default outline on focus */
              .rdp-button:focus-visible:not([disabled]) {
                outline: none;
              }

              /* Override the default blue color for today */
              .rdp-day_today {
                background: none !important;
                color: rgb(22 163 74) !important;
                font-weight: bold !important;
                border: 2px solid rgb(22 163 74) !important;
              }

              .rdp-day_today:not(.rdp-day_outside) {
                color: rgb(22 163 74) !important;
              }

              /* Override the default blue color for selected */
              .rdp-day_selected:not([disabled]),
              .rdp-day_selected:focus:not([disabled]),
              .rdp-day_selected:active:not([disabled]),
              .rdp-day_selected:hover:not([disabled]) {
                color: white !important;
                background-color: rgb(22 163 74) !important;
                border-color: rgb(22 163 74) !important;
              }

              /* Override hover state */
              .rdp-day:hover:not([disabled]):not(.rdp-day_selected) {
                color: rgb(22 163 74) !important;
                background-color: rgb(220 252 231) !important;
              }

              /* Navigation buttons */
              .rdp-nav_button {
                color: rgb(22 163 74) !important;
              }
              .rdp-nav_button:hover,
              .rdp-nav_button:focus-visible {
                color: rgb(22 163 74) !important;
                background-color: rgb(220 252 231) !important;
              }

              /* Navigation arrows */
              .rdp-nav button svg {
                fill: rgb(22 163 74) !important;
              }

              /* Override any remaining blue styles */
              .rdp-button_reset {
                color: inherit !important;
              }
              
              .rdp-day {
                color: inherit !important;
              }

              .rdp-day_today.rdp-day_selected {
                color: white !important;
              }

              /* Disabled dates */
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
              selected={selectedDate || undefined}
              onSelect={(date) => {
                if (date) {
                  handleDateSelect(date);
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
                  color: 'rgb(156 163 175) !important', // text-gray-400
                  cursor: 'not-allowed',
                  backgroundColor: 'rgb(243 244 246) !important', // bg-gray-100
                }
              }}
            />
          </div>
        </div>
      )}
    </Layout>
  );
} 