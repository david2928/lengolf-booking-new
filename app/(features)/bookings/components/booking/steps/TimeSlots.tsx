'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ClockIcon,
  SunIcon,
  CloudIcon,
  MoonIcon,
  UsersIcon,
  ComputerDesktopIcon
} from '@heroicons/react/24/outline';
import { useAvailability, type TimeSlot } from '../../../hooks/useAvailability';
import { BayType } from '@/lib/bayConfig';
import { BayInfoModal } from '../../BayInfoModal';

interface TimeSlotsProps {
  selectedDate: Date;
  onBack: () => void;
  onTimeSelect: (time: string, maxHours: number, bayType?: BayType, slotData?: TimeSlot) => void;
}

type BayFilterType = 'all' | 'social' | 'ai_lab';

export function TimeSlots({ selectedDate, onTimeSelect }: TimeSlotsProps) {
  const { isLoadingSlots, availableSlots, fetchAvailability } = useAvailability();
  const [bayFilter, setBayFilter] = useState<BayFilterType>('all');
  const [showBayInfoModal, setShowBayInfoModal] = useState(false);

  useEffect(() => {
    fetchAvailability(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]); // fetchAvailability excluded to prevent race conditions

  // Filter slots based on bay type selection
  const filterSlotsByBayType = (slots: TimeSlot[], filterType: BayFilterType): TimeSlot[] => {
    if (filterType === 'all') return slots;

    return slots.filter(slot => {
      if (!slot.availableBays) return false;

      if (filterType === 'social') {
        return slot.socialBayCount && slot.socialBayCount > 0;
      } else if (filterType === 'ai_lab') {
        return slot.aiLabCount && slot.aiLabCount > 0;
      }

      return false;
    });
  };

  const filteredSlots = filterSlotsByBayType(availableSlots, bayFilter);

  // Get the appropriate bay type to pass to onTimeSelect
  const getBayTypeForSelection = (): BayType | undefined => {
    if (bayFilter === 'social') return 'social';
    if (bayFilter === 'ai_lab') return 'ai_lab';

    // For 'all' filter, let user choose in the booking details form
    if (bayFilter === 'all') return undefined;

    return undefined;
  };

  // Bay Filter Component
  const BayTypeFilter = () => (
    <div className="mb-4">
      <div className="grid grid-cols-3 gap-2 mb-3">
        <button
          onClick={() => setBayFilter('all')}
          className={`px-3 py-2.5 rounded-lg font-medium transition-colors text-center text-sm ${
            bayFilter === 'all'
              ? 'bg-gray-800 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All Bays
        </button>
        <button
          onClick={() => setBayFilter('social')}
          className={`px-3 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 text-sm ${
            bayFilter === 'social'
              ? 'bg-green-600 text-white'
              : 'bg-green-50 text-green-700 hover:bg-green-100'
          }`}
        >
          <UsersIcon className="h-4 w-4 flex-shrink-0" />
          <span className="hidden sm:inline">Social Bays</span>
          <span className="sm:hidden">Social</span>
        </button>
        <button
          onClick={() => setBayFilter('ai_lab')}
          className={`px-3 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 text-sm ${
            bayFilter === 'ai_lab'
              ? 'bg-purple-600 text-white'
              : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
          }`}
        >
          <ComputerDesktopIcon className="h-4 w-4 flex-shrink-0" />
          <span>AI Bay</span>
        </button>
      </div>
      
      {/* Learn More Button */}
      <div className="text-center">
        <button
          onClick={() => setShowBayInfoModal(true)}
          className="text-sm text-gray-600 hover:text-gray-800 underline transition-colors"
        >
          ❓ What&apos;s the difference?
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-32rem)]">
      <BayTypeFilter />
      
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
            const periodSlots = filteredSlots.filter(slot => slot.period === period);
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
                           '(17:00 - 23:00)'}
                        </span>
                      </h3>
                    </div>
                  </div>
                </div>

                {/* Time Slots - Paired by hour */}
                <div className="divide-y">
                  {(() => {
                    const sorted = [...periodSlots].sort((a, b) => a.startTime.localeCompare(b.startTime));
                    const bayType = getBayTypeForSelection();

                    // Group into pairs by hour: [12:00, 12:30], [13:00, 13:30], etc.
                    const pairs: [TimeSlot, TimeSlot | null][] = [];
                    let i = 0;
                    while (i < sorted.length) {
                      const current = sorted[i];
                      const next = sorted[i + 1];
                      const currentMin = current.startTime.split(':')[1];
                      if (currentMin === '00' && next && next.startTime.split(':')[1] === '30'
                          && next.startTime.split(':')[0] === current.startTime.split(':')[0]) {
                        pairs.push([current, next]);
                        i += 2;
                      } else {
                        pairs.push([current, null]);
                        i += 1;
                      }
                    }

                    const renderTimeButton = (slot: TimeSlot) => {
                      const limited = slot.maxHours <= 2;
                      return (
                        <button
                          onClick={() => onTimeSelect(slot.startTime, slot.maxHours, bayType, slot)}
                          className={`flex flex-col items-center justify-center h-12 w-full rounded-lg border transition-colors ${
                            limited
                              ? 'border-amber-200 bg-amber-50/50 hover:border-amber-400 hover:bg-amber-50'
                              : 'border-gray-200 hover:border-green-500 hover:bg-green-50'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <ClockIcon className={`h-4 w-4 flex-shrink-0 ${limited ? 'text-amber-600' : 'text-green-700'}`} />
                            <span className={`text-base font-semibold ${limited ? 'text-amber-700' : 'text-green-800'}`}>{slot.startTime}</span>
                          </span>
                          {limited && (
                            <span className="text-[10px] text-amber-600 font-medium -mt-0.5">{slot.maxHours}hr max</span>
                          )}
                        </button>
                      );
                    };

                    return pairs.map(([primary, half], pairIndex) => (
                      <motion.div
                        key={pairIndex}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2, delay: pairIndex * 0.05 }}
                        className="px-4 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex-1">{renderTimeButton(primary)}</div>
                          <div className="flex-1">{half ? renderTimeButton(half) : null}</div>
                        </div>
                      </motion.div>
                    ));
                  })()}
                </div>
              </div>
            );
          })}
          {filteredSlots.length === 0 && !isLoadingSlots && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="lg:col-span-3 flex items-center justify-center"
            >
              <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <p className="text-gray-600 text-lg">
                  {availableSlots.length === 0 
                    ? "No available time slots for this date."
                    : `No available ${bayFilter === 'social' ? 'Social Bay' : bayFilter === 'ai_lab' ? 'AI Lab' : ''} slots for this date.`
                  }
                </p>
                {availableSlots.length > 0 && bayFilter !== 'all' && (
                  <button
                    onClick={() => setBayFilter('all')}
                    className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Show All Available Times
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
      
      {/* Bay Information Modal */}
      <BayInfoModal 
        isOpen={showBayInfoModal} 
        onClose={() => setShowBayInfoModal(false)} 
      />
    </div>
  );
} 