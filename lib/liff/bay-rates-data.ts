/**
 * Bay Rates Data
 * Data structures and helper functions for the Bay Rates LIFF page
 */

export interface TimeSlot {
  id: string;
  startHour: number;        // 0-23 format
  endHour: number;          // 0-23 format
  label: { en: string; th: string };
  isPromo?: boolean;
}

export interface Rate {
  timeSlotId: string;
  weekdayPrice: number;
  weekendPrice: number;
  originalWeekdayPrice?: number;   // For strikethrough (promo)
  originalWeekendPrice?: number;
}

export interface Amenity {
  id: string;
  icon: 'clubs' | 'storage' | 'gloves';
  title: { en: string; th: string };
  description: { en: string; th: string };
  type: 'free' | 'paid' | 'available';
}

export interface BayRatesConfig {
  operatingHours: {
    weekday: { days: { en: string; th: string }; open: string; close: string };
    weekend: { days: { en: string; th: string }; open: string; close: string };
  };
  appointmentNote: { en: string; th: string };
  rateNote: { en: string; th: string };
}

export const timeSlots: TimeSlot[] = [
  {
    id: 'morning',
    startHour: 10,
    endHour: 14,
    label: { en: 'Before 14:00', th: 'ก่อน 14:00' },
  },
  {
    id: 'afternoon',
    startHour: 14,
    endHour: 17,
    label: { en: '14:00 - 17:00', th: '14:00 - 17:00' },
  },
  {
    id: 'evening',
    startHour: 17,
    endHour: 23,
    label: { en: '17:00 - 23:00', th: '17:00 - 23:00' },
    isPromo: true,
  },
];

export const rates: Rate[] = [
  {
    timeSlotId: 'morning',
    weekdayPrice: 500,
    weekendPrice: 700,
  },
  {
    timeSlotId: 'afternoon',
    weekdayPrice: 700,
    weekendPrice: 900,
  },
  {
    timeSlotId: 'evening',
    weekdayPrice: 700,
    weekendPrice: 900,
    originalWeekdayPrice: 1200,
    originalWeekendPrice: 1400,
  },
];

export const amenities: Amenity[] = [
  {
    id: 'rental',
    icon: 'clubs',
    title: { en: 'Golf Club Rental', th: 'เช่าไม้กอล์ฟ' },
    description: { en: 'Free', th: 'ฟรี' },
    type: 'free',
  },
  {
    id: 'storage',
    icon: 'storage',
    title: { en: 'Golf Club Storage', th: 'ฝากไม้กอล์ฟ' },
    description: { en: 'Available', th: 'มีบริการ' },
    type: 'available',
  },
  {
    id: 'gloves',
    icon: 'gloves',
    title: { en: 'Golf Gloves', th: 'ถุงมือกอล์ฟ' },
    description: { en: 'For Purchase', th: 'มีจำหน่าย' },
    type: 'paid',
  },
];

export const bayRatesConfig: BayRatesConfig = {
  operatingHours: {
    weekday: {
      days: { en: 'Mon - Sun', th: 'จันทร์ - อาทิตย์' },
      open: '10:00',
      close: '23:00',
    },
    weekend: {
      days: { en: 'Fri - Sun', th: 'ศุกร์ - อาทิตย์' },
      open: '10:00',
      close: '23:00',
    },
  },
  appointmentNote: {
    en: '*After 23:00 or before 10:00 only via appointment',
    th: '*หลัง 23:00 หรือก่อน 10:00 กรุณานัดหมายล่วงหน้า',
  },
  rateNote: {
    en: 'Rates are per bay and per hour',
    th: 'ราคาต่อเบย์ ต่อชั่วโมง',
  },
};

/**
 * Get the current time slot based on Bangkok time
 */
export function getCurrentTimeSlot(): {
  slot: TimeSlot | null;
  isWeekend: boolean;
} {
  const now = new Date();
  const bangkokTime = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
  );
  const currentHour = bangkokTime.getHours();
  const dayOfWeek = bangkokTime.getDay(); // 0 = Sunday

  // Weekend is Friday (5), Saturday (6), Sunday (0)
  const isWeekend = dayOfWeek === 0 || dayOfWeek >= 5;

  const slot =
    timeSlots.find(
      (s) => currentHour >= s.startHour && currentHour < s.endHour
    ) || null;

  return { slot, isWeekend };
}

/**
 * Get the current rate based on current time
 */
export function getCurrentRate(): {
  rate: Rate | null;
  isWeekend: boolean;
  price: number | null;
} {
  const { slot, isWeekend } = getCurrentTimeSlot();
  if (!slot) return { rate: null, isWeekend, price: null };

  const rate = rates.find((r) => r.timeSlotId === slot.id) || null;
  const price = rate
    ? isWeekend
      ? rate.weekendPrice
      : rate.weekdayPrice
    : null;

  return { rate, isWeekend, price };
}
