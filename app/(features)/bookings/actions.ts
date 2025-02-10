import { getCurrentBangkokTime } from '@/utils/date';

export async function getAvailability(date: string) {
  try {
    const response = await fetch('/api/availability', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        date,
        currentTimeInBangkok: getCurrentBangkokTime()
      })
    });

    if (!response.ok) {
      throw new Error('Failed to fetch availability');
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching availability:', error);
    throw error;
  }
} 