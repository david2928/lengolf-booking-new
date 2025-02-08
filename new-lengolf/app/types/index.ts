export type BookingFormData = {
  bay_number: number;
  date: Date;
  start_time: string;
  duration: number;
};

export type Booking = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone_number: string;
  date: string;
  start_time: string;
  duration: number;
  number_of_people: number;
  status: 'confirmed' | 'cancelled';
  created_at: string;
  updated_at: string;
}; 