import { useState } from 'react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getCurrentBangkokTime } from '@/utils/date';

interface TimeSlot {
  startTime: string;
  endTime: string;
  maxHours: number;
  period: 'morning' | 'afternoon' | 'evening';
}

export function useAvailability() {
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const router = useRouter();
  const { data: session } = useSession();

  const fetchAvailability = async (selectedDate: Date) => {
    setIsLoadingSlots(true);

    try {
      if (!session) {
        router.push('/auth/login');
        return;
      }

      // Get current time in Bangkok timezone
      const currentTimeInBangkok = getCurrentBangkokTime();
      
      const response = await fetch('/api/availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: format(selectedDate, 'yyyy-MM-dd'),
          currentTimeInBangkok: currentTimeInBangkok.toISOString()
        }),
      });

      if (response.status === 401) {
        router.push('/auth/login');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch availability');
      }

      const data = await response.json();
      setAvailableSlots(data.slots);
    } catch (error) {
      setAvailableSlots([]);
      console.error('Error fetching availability:', error);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  return {
    isLoadingSlots,
    availableSlots,
    fetchAvailability,
  };
} 