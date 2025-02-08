'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { format, addDays, parse } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Menu } from '@headlessui/react';
import { 
  CalendarIcon, 
  ChevronDownIcon, 
  ClockIcon, 
  ArrowLeftIcon,
  SunIcon,
  MoonIcon,
  CloudIcon,
  PhoneIcon,
  XMarkIcon,
  EnvelopeIcon
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import TimeSlots from '@/app/components/TimeSlots';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { debug } from '@/lib/debug';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/app/types/supabase';

import Layout from '../components/booking/Layout';
import ProgressBar from '../components/booking/ProgressBar';
import BookingDetails from '../components/booking/BookingDetails';

interface MenuItemProps {
  active: boolean;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  maxHours: number;
  period: 'morning' | 'afternoon' | 'evening';
}

const OPENING_HOUR = 10; // 10:00
const CLOSING_HOUR = 23; // 23:00
const TIME_SLOTS = Array.from({ length: CLOSING_HOUR - OPENING_HOUR }, (_, i) => {
  const hour = OPENING_HOUR + i;
  const timeStr = `${hour.toString().padStart(2, '0')}:00`;
  let period: 'morning' | 'afternoon' | 'evening';
  if (hour < 13) period = 'morning';
  else if (hour < 17) period = 'afternoon';
  else period = 'evening';
  return { timeStr, period };
});

const steps = [
  { title: 'Select Date', description: 'Choose your day' },
  { title: 'Select Time', description: 'Choose slot' },
  { title: 'Provide Details', description: 'Confirm booking' }
];

export default function BookingPage() {
  const router = useRouter();
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(null);
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const dayAfterTomorrow = addDays(today, 2);

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [showBayRates, setShowBayRates] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<Array<{
    startTime: string;
    maxHours: number;
    period: 'morning' | 'afternoon' | 'evening';
  }>>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [showDateSelection, setShowDateSelection] = useState(true);
  const [showQuickInfo, setShowQuickInfo] = useState(false);

  useEffect(() => {
    const initSupabase = async () => {
      const client = await createClient();
      setSupabase(client);
    };
    initSupabase();
  }, []);

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  const handleDateSelect = async (date: Date) => {
    setSelectedDate(date);
    await fetchAvailableSlots(date);
    setCurrentStep(2);
  };

  const handleTimeSelect = (time: string, maxHours: number) => {
    setSelectedTime(time);
    setCurrentStep(3);
  };

  const handleBookingSubmit = async (formData: {
    duration: number;
    phoneNumber: string;
    email: string;
    numberOfPeople: number;
  }) => {
    if (!supabase) return;

    try {
      // First check session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        debug.error('Booking: Session error or no session', sessionError);
        router.push('/auth/login');
        return;
      }

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        debug.error('Booking: User error or no user', userError);
        router.push('/auth/login');
        return;
      }

      // Generate a unique booking ID (prefix + timestamp + random number)
      const bookingId = `BK${Date.now()}${Math.floor(Math.random() * 1000)}`;

      // Create booking record
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          id: bookingId,
          user_id: user.id,
          name: localStorage.getItem('name') || user.user_metadata?.name || '',
          email: formData.email,
          phone_number: formData.phoneNumber,
          date: selectedDate?.toISOString().split('T')[0],
          start_time: selectedTime,
          duration: formData.duration,
          number_of_people: formData.numberOfPeople,
          status: 'confirmed',
        })
        .select()
        .single();

      if (bookingError) {
        debug.error('Booking: Error creating booking record', bookingError);
        throw bookingError;
      }

      // Update user's phone number
      const loginMethod = localStorage.getItem('loginMethod');
      if (loginMethod === 'guest') {
        // For guest users, save to localStorage
        localStorage.setItem('phoneNumber', formData.phoneNumber);
      } else {
        // For social login users, update auth.users
        const { error: updateError } = await supabase.auth.updateUser({
          data: { phone: formData.phoneNumber }
        });

        if (updateError) {
          debug.error('Booking: Error updating user phone:', updateError);
        }
      }

      // Redirect to confirmation page
      router.push(`/bookings/confirmation?id=${bookingId}`);
    } catch (error) {
      debug.error('Booking: Error creating booking:', error);
      // TODO: Show error message to user
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      if (currentStep === 2) {
        // Reset selected date when going back to date selection
        setSelectedDate(null);
      }
      setCurrentStep(currentStep - 1);
    }
  };

  const fetchAvailableSlots = async (date: Date) => {
    setIsLoadingSlots(true);
    try {
      const currentDate = new Date();
      const isToday = date.toDateString() === currentDate.toDateString();
      const currentHour = currentDate.getHours();

      // Business hours: 10:00 - 22:00 (last slot at 22:00)
      const slots = Array.from({ length: 13 }, (_, i) => {
        const hour = i + 10; // Start from 10 AM
        const hoursUntilClose = 23 - hour; // Hours until closing (11 PM)
        const maxHours = Math.min(5, hoursUntilClose);
        
        const period = hour < 13 ? 'morning' as const : 
                      hour < 17 ? 'afternoon' as const : 
                      'evening' as const;
        
        return {
          startTime: `${hour.toString().padStart(2, '0')}:00`,
          maxHours,
          period
        };
      });

      // Filter slots based on current time if it's today
      const availableSlots = slots
        .filter(slot => {
          const hour = parseInt(slot.startTime);
          return !isToday || hour > currentHour;
        });

      setAvailableSlots(availableSlots);
    } catch (error) {
      console.error('Error fetching available slots:', error);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const handleCustomDateSelect = () => {
    setShowCalendar(true);
  };

  const handleCalendarSelect = (value: Date | null) => {
    if (value) {
      handleDateSelect(value);
      setShowCalendar(false);
    }
  };

  return (
    <Layout onLogout={handleLogout}>
      <div className="min-h-[36rem]">
        {/* Page Title and Back Button */}
        <div className="mb-6 flex items-center">
          {currentStep > 1 && (
            <button
              onClick={handleBack}
              className="mr-4 p-2 rounded-lg hover:bg-gray-100"
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
                ? `Available slots for ${format(selectedDate!, 'EEEE, dd MMMM yyyy')}`
                : 'Complete your booking details.'
              }
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="relative">
          {/* Loading Overlay */}
          {isLoadingSlots && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 bg-opacity-75">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-lg text-gray-600">Loading available times...</p>
              </div>
            </div>
          )}

          {/* Content */}
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
                    <div className="text-gray-600 mt-1">Choose custom date</div>
                  </div>
                </button>
              </div>
            )}

            {currentStep === 2 && selectedDate && (
              <div className="space-y-6">
                {['morning', 'afternoon', 'evening'].map((period) => {
                  const periodSlots = availableSlots.filter(slot => slot.period === period);
                  if (periodSlots.length === 0) return null;

                  return (
                    <div key={period} className="bg-white rounded-xl shadow-sm p-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                        {period === 'morning' ? (
                          <SunIcon className="h-5 w-5 mr-2 text-amber-500" />
                        ) : period === 'afternoon' ? (
                          <CloudIcon className="h-5 w-5 mr-2 text-blue-500" />
                        ) : (
                          <MoonIcon className="h-5 w-5 mr-2 text-indigo-500" />
                        )}
                        {period.charAt(0).toUpperCase() + period.slice(1)}
                        <span className="text-sm font-normal text-gray-500 ml-2">
                          {period === 'morning' ? '(10:00 - 13:00)' : 
                           period === 'afternoon' ? '(13:00 - 17:00)' : 
                           '(17:00 - 23:00)'}
                        </span>
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {periodSlots.map((slot, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.3, delay: index * 0.05 }}
                            className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-all"
                          >
                            <div className="flex items-center gap-2 text-green-800 mb-2">
                              <ClockIcon className="h-5 w-5" />
                              <span className="text-2xl font-bold">{slot.startTime}</span>
                            </div>
                            <p className="text-gray-600 text-sm mb-3">
                              Available for up to {slot.maxHours} hour{slot.maxHours > 1 ? 's' : ''}
                            </p>
                            <button
                              onClick={() => handleTimeSelect(slot.startTime, slot.maxHours)}
                              className="w-full bg-green-700 text-white py-2.5 px-4 rounded-lg hover:bg-green-800 transition-colors font-semibold text-sm"
                            >
                              Select
                            </button>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {currentStep === 3 && selectedDate && selectedTime && (
              <BookingDetails
                selectedDate={selectedDate}
                selectedTime={selectedTime}
                maxDuration={5}
                onSubmit={handleBookingSubmit}
              />
            )}
          </div>
        </div>
      </div>

      {/* Calendar Modal */}
      {showCalendar && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCalendar(false)}>
          <div className="bg-white rounded-xl p-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">Select Date</h3>
              <button onClick={() => setShowCalendar(false)} className="text-gray-500 hover:text-gray-700">
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
              .rdp-day_today:not(.rdp-day_outside) {
                font-weight: bold;
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
              className="p-3"
              modifiers={{
                today: new Date(),
              }}
              modifiersStyles={{
                today: {
                  fontWeight: 'bold',
                  color: 'rgb(22 163 74)'
                }
              }}
            />
          </div>
        </div>
      )}
    </Layout>
  );
} 