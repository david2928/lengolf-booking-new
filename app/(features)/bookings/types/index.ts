export interface TimeSlot {
  startTime: string;
  endTime: string;
  maxHours: number;
  period: 'morning' | 'afternoon' | 'evening';
}

export interface BookingFormData {
  date: Date;
  startTime: string;
  duration: number;
  numberOfPeople: number;
  phoneNumber: string;
  email: string;
}

export interface BookingConfirmation {
  id: string;
  bay: string;
  eventId: string;
} 