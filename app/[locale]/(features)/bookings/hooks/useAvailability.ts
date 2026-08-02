import { useState, useCallback, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { getCurrentBangkokTime } from '@/utils/date';

interface DurationBayAvailability {
  social: number;
  ai: number;
  total: number;
  bays: string[];
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  /**
   * Longest bookable session at this slot, in hours. FRACTIONAL since the
   * availability function moved to v3 — 2.5 is a normal value. Do not narrow
   * this to an integer type and do not round it: `lib/booking-durations.ts`
   * filters the duration ladder with `hours <= maxHours`, so rounding 2.5 up to
   * 3 would offer a duration the server rejects, and rounding down would hide a
   * bookable 2.5.
   */
  maxHours: number;
  /**
   * @deprecated Vestigial wire field. The SQL splits the morning at hour < 12,
   * which contradicts the hour captions the customer reads and the LIFF flow.
   * Nothing consumes it — group with `getBookingPeriod` from
   * `lib/booking-periods.ts` instead. Typed only to describe the payload.
   */
  period?: 'morning' | 'afternoon' | 'evening';
  availableBays?: string[];
  socialBayCount?: number;
  aiLabCount?: number;
  totalBayCount?: number;
  bayAvailabilityByDuration?: Record<string, DurationBayAvailability>;
}

export type { TimeSlot, DurationBayAvailability };

export function useAvailability() {
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRequestDateRef = useRef<string>('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadingRef = useRef<boolean>(false);
  const requestCounterRef = useRef<number>(0);

  /**
   * @param excludeBookingId When editing a booking, its own id. The server
   *   ignores that booking while computing availability, so the customer is not
   *   shown their current slot as full. Honoured only for the booking's owner;
   *   see `/api/availability`.
   */
  const fetchAvailability = useCallback(async (selectedDate: Date, excludeBookingId?: string) => {
    const dateString = format(selectedDate, 'yyyy-MM-dd');

    // Increment request counter for this specific request
    const currentRequestId = ++requestCounterRef.current;

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
          // No session pre-check. Availability is public, read-only data that
          // the booking UI renders to anyone anyway, and requiring a session
          // here bounced anonymous visitors out of the flow before they saw a
          // single slot.

          // Check if this request is still the latest one
          if (currentRequestId !== requestCounterRef.current) {
            resolve();
            return;
          }

          // Get current time in Bangkok timezone
          const currentTimeInBangkok = getCurrentBangkokTime();

          const requestBody = {
            date: dateString,
            currentTimeInBangkok: currentTimeInBangkok.toISOString(),
            ...(excludeBookingId ? { excludeBookingId } : {})
          };

          const response = await fetch('/api/availability', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: abortController.signal,
          });

          // Check again if this request is still the latest one before processing response
          if (currentRequestId !== requestCounterRef.current) {
            resolve();
            return;
          }

          // A 401 is no longer an expected outcome — the route serves anonymous
          // callers. If one appears it is a server-side regression, so let it
          // fall through to the generic error path and surface as such rather
          // than silently ejecting the customer to a login page.
          if (!response.ok) {
            throw new Error('Failed to fetch availability');
          }

          const data = await response.json();

          // Final check before setting state
          if (currentRequestId === requestCounterRef.current) {
            setAvailableSlots(data.slots);
          }
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
  // No auth dependencies: the fetch no longer reads session state, so this
  // callback is stable for the life of the hook.
  }, []);

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