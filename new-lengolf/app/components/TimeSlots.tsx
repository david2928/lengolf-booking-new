'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { ClockIcon, SunIcon, CloudIcon, MoonIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import { createClient, isRestoringSupabaseSession, waitForSessionRestore } from '@/lib/supabase/client';
import { debug } from '@/lib/debug';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/app/types/supabase';
import { Session } from '@supabase/supabase-js';

interface TimeSlot {
  startTime: string;
  endTime: string;
  maxHours: number;
  period: 'morning' | 'afternoon' | 'evening';
}

interface TimeSlotsProps {
  selectedDate: Date;
  onBack: () => void;
  onTimeSelect: (time: string, maxHours: number) => void;
}

export default function TimeSlots({ selectedDate, onBack, onTimeSelect }: TimeSlotsProps) {
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const router = useRouter();
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(null);

  useEffect(() => {
    const initSupabase = async () => {
      debug.log('TimeSlots: Initializing Supabase client')
      const client = await createClient();
      debug.log('TimeSlots: Supabase client created')
      setSupabase(client);

      // Immediately check session after client creation
      const { data: { session }, error } = await client.auth.getSession()
      debug.log('TimeSlots: Initial session check', {
        hasSession: !!session,
        error: error?.message,
        sessionDetails: session ? {
          ...session,
          access_token: session.access_token?.slice(-10) + '...',
          refresh_token: session.refresh_token?.slice(-10) + '...',
          user: {
            email: session.user.email,
            id: session.user.id,
            provider: session.user.app_metadata?.provider
          }
        } : null
      })
    };
    initSupabase();
  }, []);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      if (!supabase) return false;
      debug.log('TimeSlots: Checking session...');
      try {
        // Log all cookies for debugging
        debug.log('TimeSlots: Current cookies:', document.cookie);

        const { data: { session }, error } = await supabase.auth.getSession();
        debug.log('TimeSlots: Session check result:', {
          hasSession: !!session,
          error: error?.message,
          sessionDetails: session ? {
            ...session,
            access_token: session.access_token?.slice(-10) + '...',
            refresh_token: session.refresh_token?.slice(-10) + '...',
            user: {
              email: session.user.email,
              id: session.user.id,
              provider: session.user.app_metadata?.provider
            }
          } : null
        });
        
        if (error) {
          debug.error('TimeSlots: Session error:', error);
          return false;
        }

        if (!session) {
          debug.warn('TimeSlots: No session found, redirecting to login');
          router.push('/auth/login');
          return false;
        }
        return true;
      } catch (err) {
        debug.error('TimeSlots: Error checking session:', err);
        return false;
      }
    };

    const fetchSlots = async () => {
      if (!mounted || !supabase) return;
      debug.log('TimeSlots: Starting fetchSlots...');
      
      const hasSession = await checkSession();
      if (!hasSession) {
        debug.log('TimeSlots: Aborting fetchSlots due to no session');
        return;
      }
      
      setIsLoadingSlots(true);
      try {
        debug.log('TimeSlots: Fetching availability data...');
        const response = await fetch('/api/availability', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            date: format(selectedDate, 'yyyy-MM-dd'),
          }),
        });

        if (response.status === 401) {
          debug.warn('TimeSlots: Received 401 from availability API');
          router.push('/auth/login');
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch availability');
        }

        const data = await response.json();
        debug.log('TimeSlots: Successfully fetched slots:', data.slots.length);
        if (mounted) {
          setAvailableSlots(data.slots);
        }
      } catch (error) {
        debug.error('TimeSlots: Error fetching slots:', error);
        if (mounted) {
          setAvailableSlots([]);
        }
      } finally {
        if (mounted) {
          setIsLoadingSlots(false);
        }
      }
    };

    if (supabase) {
      // Set up auth state change listener with detailed logging
      debug.log('TimeSlots: Setting up auth state listener');
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        debug.log('TimeSlots: Auth state changed:', {
          event,
          hasSession: !!session,
          sessionDetails: session ? {
            ...session,
            access_token: session.access_token?.slice(-10) + '...',
            refresh_token: session.refresh_token?.slice(-10) + '...',
            user: {
              email: session.user.email,
              id: session.user.id,
              provider: session.user.app_metadata?.provider
            }
          } : null
        });

        if (event === 'SIGNED_OUT' && mounted) {
          debug.warn('TimeSlots: User signed out, redirecting');
          router.push('/auth/login');
        }
      });

      fetchSlots();

      return () => {
        debug.log('TimeSlots: Cleaning up component');
        mounted = false;
        subscription.unsubscribe();
      };
    }
  }, [selectedDate, router, supabase]);

  const handleTimeSelection = async (time: string, maxHours: number) => {
    if (!supabase) {
      debug.error('TimeSlots: No Supabase client available');
      return;
    }

    debug.log('TimeSlots: Starting time selection process', { time, maxHours });

    try {
      // Check if session is being restored
      if (isRestoringSupabaseSession()) {
        debug.log('TimeSlots: Waiting for session restoration...');
        const sessionRestorePromise = waitForSessionRestore();
        if (sessionRestorePromise) {
          const restored = await sessionRestorePromise;
          debug.log('TimeSlots: Session restoration complete', { restored });
          if (!restored) {
            debug.warn('TimeSlots: Session restoration failed, redirecting to login');
            router.push('/auth/login');
            return;
          }
        }
      }

      const client = await createClient();
      const { data: { session }, error } = await client.auth.getSession();

      debug.log('TimeSlots: Session check', {
        hasSession: !!session,
        error: error?.message,
        isRestoring: isRestoringSupabaseSession()
      });

      if (error || !session) {
        debug.warn('TimeSlots: No valid session, redirecting to login', {
          error: error?.message,
          currentPath: window.location.pathname + window.location.search
        });
        
        // Store current path for redirect after login
        localStorage.setItem('redirectAfterLogin', window.location.pathname + window.location.search);
        router.push('/auth/login');
        return;
      }

      // Proceed with time slot selection
      onTimeSelect(time, maxHours);
      
      // Log final state
      debug.log('TimeSlots: Selection completed', {
        time,
        maxHours,
        selectedDate: selectedDate.toISOString(),
        userEmail: session.user.email
      });
    } catch (err) {
      debug.error('TimeSlots: Unexpected error during time selection:', err);
      router.push('/auth/login');
    }
  };

  return (
    <div className="min-h-[calc(100vh-24rem)]">
      <div className="flex items-center mb-6">
        <button
          onClick={onBack}
          className="mr-4 p-2 rounded-lg hover:bg-gray-100"
        >
          <ArrowLeftIcon className="h-6 w-6 text-gray-600" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Select Time</h2>
          <p className="text-gray-600">Available slots for {format(selectedDate, 'EEEE, dd MMMM yyyy')}</p>
        </div>
      </div>

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
            className="space-y-6"
          >
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
                       '(17:00 - 22:00)'}
                    </span>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {periodSlots
                      .sort((a, b) => a.startTime.localeCompare(b.startTime))
                      .map((slot, index) => (
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
                            onClick={() => handleTimeSelection(slot.startTime, slot.maxHours)}
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
            {availableSlots.length === 0 && !isLoadingSlots && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center h-[calc(100vh-32rem)]"
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
    </div>
  );
} 