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

  // Helper to check if bay types change across durations
  const getDurationWarning = (slot: TimeSlot): string | null => {
    if (!slot.bayAvailabilityByDuration || slot.maxHours === 1) return null;

    // Track what's available at each duration
    let hasSocialToAiSwitch = false;
    let hasAiToSocialSwitch = false;
    let switchDuration = 0;

    // Check each duration to see if bay types change
    for (let i = 1; i <= slot.maxHours; i++) {
      const currentAvail = slot.bayAvailabilityByDuration[i.toString()];
      const nextAvail = slot.bayAvailabilityByDuration[(i + 1).toString()];

      if (!currentAvail || !nextAvail) continue;

      // Check if social bays disappear
      if (currentAvail.social > 0 && nextAvail.social === 0 && nextAvail.ai > 0) {
        hasSocialToAiSwitch = true;
        switchDuration = i + 1;
        break;
      }

      // Check if AI bay disappears
      if (currentAvail.ai > 0 && nextAvail.ai === 0 && nextAvail.social > 0) {
        hasAiToSocialSwitch = true;
        switchDuration = i + 1;
        break;
      }
    }

    if (hasSocialToAiSwitch) {
      return `Social bays available up to ${switchDuration - 1}hr. ${switchDuration}+ hrs requires AI Bay.`;
    }

    if (hasAiToSocialSwitch) {
      return `AI Bay available up to ${switchDuration - 1}hr. ${switchDuration}+ hrs requires Social Bay.`;
    }

    return null;
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
          <span className="truncate">Social Bays</span>
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
          <span className="truncate">AI Bay</span>
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

                {/* Time Slots */}
                <div className="divide-y">
                  {periodSlots
                    .sort((a, b) => a.startTime.localeCompare(b.startTime))
                    .map((slot, index) => {
                      const bayType = getBayTypeForSelection();
                      
                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.2, delay: index * 0.05 }}
                          className="group px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => onTimeSelect(slot.startTime, slot.maxHours, bayType, slot)}
                        >
                          <div className="space-y-2">
                            {/* Main time and duration */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center flex-1">
                                <div className="flex items-center text-green-800 w-20">
                                  <ClockIcon className="h-5 w-5 mr-2" />
                                  <span className="text-lg font-semibold">{slot.startTime}</span>
                                </div>
                                <div className="text-gray-600 text-sm ml-6 flex items-center gap-2">
                                  <span className="hidden sm:inline">Up to {slot.maxHours} hour{slot.maxHours > 1 ? 's' : ''}</span>
                                  <span className="sm:hidden">{slot.maxHours} hour{slot.maxHours > 1 ? 's' : ''}</span>
                                  {/* Show bay type indicator */}
                                  {(() => {
                                    const firstDuration = slot.bayAvailabilityByDuration?.['1'];
                                    if (!firstDuration) return null;

                                    // Check if it's mixed or single type
                                    const hasBoth = firstDuration.social > 0 && firstDuration.ai > 0;
                                    const socialOnly = firstDuration.social > 0 && firstDuration.ai === 0;
                                    const aiOnly = firstDuration.social === 0 && firstDuration.ai > 0;

                                    const warning = getDurationWarning(slot);

                                    if (hasBoth && !warning) {
                                      // Both available and no changes - don't show anything
                                      return null;
                                    }

                                    if (socialOnly) {
                                      return (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs border border-green-200">
                                          <UsersIcon className="h-3 w-3" />
                                          <span>Social only</span>
                                        </span>
                                      );
                                    }

                                    if (aiOnly) {
                                      return (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs border border-purple-200">
                                          <ComputerDesktopIcon className="h-3 w-3" />
                                          <span>AI only</span>
                                        </span>
                                      );
                                    }

                                    // If there's a warning about bay types changing
                                    if (warning) {
                                      return (
                                        <div className="relative group/tooltip">
                                          <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs border border-amber-200 cursor-help">
                                            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                            </svg>
                                            <span>Bay varies</span>
                                          </div>
                                          {/* Tooltip */}
                                          <div className="invisible group-hover/tooltip:visible absolute left-0 top-full mt-1 z-10 w-64 px-3 py-2 text-xs bg-gray-900 text-white rounded shadow-lg pointer-events-none">
                                            {warning}
                                          </div>
                                        </div>
                                      );
                                    }

                                    return null;
                                  })()}
                                </div>
                              </div>
                              <div className="flex items-center text-green-700 font-medium group-hover:text-green-800">
                                Select
                                <svg className="w-5 h-5 ml-1 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
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