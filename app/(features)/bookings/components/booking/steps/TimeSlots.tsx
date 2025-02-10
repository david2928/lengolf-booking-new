'use client';

import { useEffect } from 'react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { ClockIcon, SunIcon, CloudIcon, MoonIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import { useAvailability } from '../../../hooks/useAvailability';

interface TimeSlotsProps {
  selectedDate: Date;
  onBack: () => void;
  onTimeSelect: (time: string, maxHours: number) => void;
}

export function TimeSlots({ selectedDate, onBack, onTimeSelect }: TimeSlotsProps) {
  const { isLoadingSlots, availableSlots, fetchAvailability } = useAvailability();
  const router = useRouter();

  useEffect(() => {
    fetchAvailability(selectedDate);
  }, [selectedDate]);

  return (
    <div className="min-h-[calc(100vh-32rem)]">
      {isLoadingSlots ? (
        <div className="flex flex-col items-center justify-center h-full py-20">
          <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-lg text-gray-600">Loading available times...</p>
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          {['morning', 'afternoon', 'evening'].map((period) => {
            const periodSlots = availableSlots.filter(slot => slot.period === period);
            if (periodSlots.length === 0) return null;

            return (
              <div key={period} className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Period Header */}
                <div className="bg-green-700 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center">
                    {period === 'morning' ? (
                      <SunIcon className="h-5 w-5 text-yellow-300 mr-2" />
                    ) : period === 'afternoon' ? (
                      <CloudIcon className="h-5 w-5 text-white mr-2" />
                    ) : (
                      <MoonIcon className="h-5 w-5 text-blue-200 mr-2" />
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {period.charAt(0).toUpperCase() + period.slice(1)}
                        <span className="ml-2 text-sm font-normal opacity-90">
                          {period === 'morning' ? '(10:00 - 13:00)' : 
                           period === 'afternoon' ? '(13:00 - 17:00)' : 
                           '(17:00 - 22:00)'}
                        </span>
                      </h3>
                    </div>
                  </div>
                </div>

                {/* Time Slots */}
                <div className="divide-y">
                  {periodSlots
                    .sort((a, b) => a.startTime.localeCompare(b.startTime))
                    .map((slot, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2, delay: index * 0.05 }}
                        className="group px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => onTimeSelect(slot.startTime, slot.maxHours)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <div className="flex items-center text-green-800 w-20">
                              <ClockIcon className="h-5 w-5 mr-2" />
                              <span className="text-lg font-semibold">{slot.startTime}</span>
                            </div>
                            <div className="text-gray-600 text-sm ml-6">
                              Up to {slot.maxHours} hour{slot.maxHours > 1 ? 's' : ''}
                            </div>
                          </div>
                          <div className="flex items-center text-green-700 font-medium group-hover:text-green-800">
                            Select
                            <svg className="w-5 h-5 ml-1 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                </div>
              </div>
            );
          })}
          {availableSlots.length === 0 && !isLoadingSlots && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="lg:col-span-3 flex items-center justify-center"
            >
              <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <p className="text-gray-600 text-lg">
                  No available time slots for this date.
                </p>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
} 