export type BookingFormData = {
  bay_number: number;
  date: Date;
  start_time: string;
  duration: number;
};

export type { Booking } from './supabase'; 