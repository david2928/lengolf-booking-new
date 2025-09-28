import { useState, useCallback, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getCurrentBangkokTime } from '@/utils/date';

interface TimeSlot {
  startTime: string;
  endTime: string;
  maxHours: number;
  period: 'morning' | 'afternoon' | 'evening';
  availableBays?: string[];
  socialBayCount?: number;
  aiLabCount?: number;
  totalBayCount?: number;
}

export function useAvailability() {
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const router = useRouter();
  const { data: session } = useSession();
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRequestDateRef = useRef<string>('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadingRef = useRef<boolean>(false);

  const fetchAvailability = useCallback(async (selectedDate: Date) => {
    const dateString = format(selectedDate, 'yyyy-MM-dd');

    // Prevent duplicate requests for the same date
    if (lastRequestDateRef.current === dateString && isLoadingRef.current) {
      return;
    }

    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Debounce the request by 100ms to prevent rapid-fire calls
    return new Promise<void>((resolve) => {
      timeoutRef.current = setTimeout(async () => {
        // Create new abort controller for this request
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        lastRequestDateRef.current = dateString;

        isLoadingRef.current = true;
        setIsLoadingSlots(true);

        try {
          if (!session) {
            router.push('/auth/login');
            resolve();
            return;
          }

          // Get current time in Bangkok timezone
          const currentTimeInBangkok = getCurrentBangkokTime();

          const requestBody = {
            date: dateString,
            currentTimeInBangkok: currentTimeInBangkok.toISOString()
          };


          const response = await fetch('/api/availability', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: abortController.signal,
          });

          if (response.status === 401) {
            router.push('/auth/login');
            resolve();
            return;
          }

          if (!response.ok) {
            throw new Error('Failed to fetch availability');
          }

          const data = await response.json();
          setAvailableSlots(data.slots);
          resolve();
        } catch (error: unknown) {
          // Don't update state if request was aborted
          if (error instanceof Error && error.name === 'AbortError') {
            resolve();
            return;
          }

          setAvailableSlots([]);
          console.error('Error fetching availability:', error);
          resolve();
        } finally {
          isLoadingRef.current = false;
          setIsLoadingSlots(false);
        }
      }, 100);
    });
  }, [session, router]);

  // Cleanup: Cancel any pending requests and timeouts when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    isLoadingSlots,
    availableSlots,
    fetchAvailability,
  };
} 