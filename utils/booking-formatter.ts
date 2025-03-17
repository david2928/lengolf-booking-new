import { format } from 'date-fns';

interface Booking {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  date: string;
  start_time: string;
  duration: number;
  number_of_people: number;
  user_id?: string;
  package_info?: string;
}

interface CrmData {
  id?: string;
  name?: string;
  [key: string]: any;
}

interface BayInfo {
  id: string;
  displayName?: string;
}

interface BookingDataParams {
  booking: Booking;
  crmData?: CrmData | null;
  bayInfo: BayInfo;
}

export function formatBookingData({
  booking,
  crmData,
  bayInfo
}: BookingDataParams) {
  // Log the input data for debugging
  console.log(`formatBookingData - Input:`, {
    bookingName: booking.name,
    crmDataName: crmData?.name,
    hasCrmData: !!crmData
  });
  
  // Determine customer name
  const customerName = crmData?.name || booking.name;
  console.log(`formatBookingData - Using customer name: "${customerName}"`);
  
  // Calculate end time
  const endTime = calculateEndTime(booking.start_time, booking.duration);
  
  // Format date
  const formattedDate = format(new Date(booking.date), 'MMMM d, yyyy');
  
  // Create standardized booking data for all services
  return {
    // Common fields for all services
    bookingId: booking.id,
    customerName: customerName,
    email: booking.email,
    phoneNumber: booking.phone_number,
    
    // Format dates and times consistently
    date: booking.date,
    formattedDate: formattedDate,
    startTime: booking.start_time,
    endTime: endTime,
    
    // Bay information
    bayId: bayInfo.id,
    bayName: bayInfo.displayName || bayInfo.id,
    
    // User and CRM data
    userId: booking.user_id,
    crmCustomerId: crmData?.id,
    isNewCustomer: !crmData?.id,
    
    // Additional booking details
    duration: booking.duration,
    numberOfPeople: booking.number_of_people,
    
    // Service-specific formatted data
    calendar: {
      summary: `${crmData?.name || booking.name} (${booking.phone_number}) (${booking.number_of_people}) at ${bayInfo.displayName || bayInfo.id}`,
      description: generateCalendarDescription(booking, bayInfo, crmData)
    },
    emailData: {
      userDisplayName: customerName,
      subject: `Your LENGOLF Booking Confirmation - ${formattedDate}`
    },
    lineNotification: {
      bookingName: booking.name,
      customerLabel: crmData?.id ? (crmData?.name || booking.name) : "New Customer"
    }
  };
}

// Helper to calculate end time from start time and duration
function calculateEndTime(startTime: string, duration: number): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + duration * 60;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
}

// Helper to generate a consistent calendar description
function generateCalendarDescription(
  booking: Booking, 
  bayInfo: BayInfo, 
  crmData?: CrmData | null
): string {
  return `Customer Name: ${crmData?.name || booking.name}
Contact: ${booking.phone_number}
Email: ${booking.email}
Type: ${booking.package_info || 'Normal Bay Rate'}
Pax: ${booking.number_of_people}
Bay: ${bayInfo.displayName || bayInfo.id}
Date: ${format(new Date(booking.date), 'EEEE, MMMM d')}
Time: ${booking.start_time} - ${calculateEndTime(booking.start_time, booking.duration)}
Via: Website
Booking ID: ${booking.id}`;
} 