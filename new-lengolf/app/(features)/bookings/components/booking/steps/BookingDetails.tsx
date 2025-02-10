'use client';

import { useState } from 'react';
import { CalendarIcon, ClockIcon } from '@heroicons/react/24/outline';
import { format, addHours } from 'date-fns';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import { sendBookingNotification } from '@/lib/lineNotifyService';

interface BookingDetailsProps {
  user: User;
  selectedDate: Date;
  selectedTime: string;
  maxDuration: number;
  onBack: () => void;
}

export function BookingDetails({
  user,
  selectedDate,
  selectedTime,
  maxDuration,
  onBack,
}: BookingDetailsProps) {
  const router = useRouter();
  const [duration, setDuration] = useState<number>(1);
  const [phoneNumber, setPhoneNumber] = useState(user.phone || user.user_metadata?.phone || '');
  const [email, setEmail] = useState(user.email || '');
  const [numberOfPeople, setNumberOfPeople] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({
    duration: '',
    phoneNumber: '',
    email: '',
  });
  const [showNoAvailabilityModal, setShowNoAvailabilityModal] = useState(false);

  const validatePhoneNumber = (phone: string) => {
    // Remove all non-digit characters
    const cleanPhone = phone.replace(/\D/g, '');
    // Check if it's a Thai number (starts with 0, 10 digits)
    const thaiRegex = /^0\d{9}$/;
    // Check if it's an international number (minimum 10 digits)
    const internationalRegex = /^\d{10,15}$/;
    
    return thaiRegex.test(cleanPhone) || internationalRegex.test(cleanPhone);
  };

  const validateForm = () => {
    const cleanPhone = phoneNumber.replace(/[- ]/g, '');
    const newErrors = {
      duration: duration === 0 ? 'Please select duration' : '',
      phoneNumber: !phoneNumber 
        ? 'Please enter phone number' 
        : !validatePhoneNumber(cleanPhone)
        ? 'Please enter a valid Thai phone number'
        : '',
      email: !email ? 'Please enter email' : '',
    };
    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error !== '');
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow digits, spaces, dashes, plus sign, and parentheses
    if (/^[0-9+\- ()]*$/.test(value)) {
      setPhoneNumber(value);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        router.push('/auth/login');
        return;
      }

      // Generate a unique booking ID
      const bookingId = `BK${Date.now()}${Math.floor(Math.random() * 1000)}`;

      // Create the booking
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert([
          {
            id: bookingId,
            user_id: user?.id,
            name: user.user_metadata?.name || '',
            email,
            phone_number: phoneNumber.replace(/[- ]/g, ''),
            date: selectedDate.toISOString().split('T')[0],
            start_time: selectedTime,
            duration,
            number_of_people: numberOfPeople,
            status: 'confirmed',
          },
        ])
        .select()
        .single();

      if (bookingError || !booking) {
        throw bookingError || new Error('Failed to create booking');
      }

      // Update user's phone number if it has changed
      const currentPhone = user.phone || user.user_metadata?.phone;
      if (currentPhone !== phoneNumber) {
        await supabase.auth.updateUser({
          data: { phone: phoneNumber }
        });
      }

      // Create calendar entry
      const calendarResponse = await fetch('/api/bookings/calendar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bookingId: booking.id,
          date: selectedDate.toISOString().split('T')[0],
          startTime: selectedTime,
          duration,
        }),
      });

      let calendarData;
      if (!calendarResponse.ok) {
        const errorData = await calendarResponse.json();
        console.error('Failed to create calendar event:', errorData);
        
        setIsSubmitting(false);
        
        // Show specific error message based on the error type
        if (errorData.error === 'No bays available for the selected time slot') {
          setShowNoAvailabilityModal(true);
          return;
        } else {
          toast.error('There was a problem creating your booking. Please try again.');
          return;
        }
      }
      
      calendarData = await calendarResponse.json();
      
      // Update the booking with the assigned bay
      if (calendarData?.bay) {
        const { error: updateError } = await supabase
          .from('bookings')
          .update({ bay: calendarData.bay })
          .eq('id', booking.id);

        if (updateError) {
          console.error('Failed to update booking with bay:', updateError);
        }
      }

      // Send LINE notification
      try {
        const endTime = format(
          addHours(new Date(`${selectedDate.toISOString().split('T')[0]}T${selectedTime}`), duration),
          'HH:mm'
        );

        await sendBookingNotification({
          customerName: user.user_metadata?.name || user.email || '',
          email,
          phoneNumber: phoneNumber.replace(/[- ]/g, ''),
          bookingDate: format(selectedDate, 'yyyy-MM-dd'),
          bookingStartTime: selectedTime,
          bookingEndTime: endTime,
          bayNumber: calendarData?.bay || 'Not assigned',
          duration,
          numberOfPeople,
        });
      } catch (error) {
        console.error('Failed to send LINE notification:', error);
        // Continue with redirect even if LINE notification fails
      }

      // Send confirmation email
      try {
        const endTime = format(
          addHours(new Date(`${selectedDate.toISOString().split('T')[0]}T${selectedTime}`), duration),
          'HH:mm'
        );

        const emailResponse = await fetch('/api/notifications/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userName: user.user_metadata?.name || user.email || '',
            email,
            date: format(selectedDate, 'dd/MM/yyyy'),
            startTime: selectedTime,
            endTime,
            duration,
            numberOfPeople,
          }),
        });

        if (!emailResponse.ok) {
          console.error('Failed to send confirmation email');
        }
      } catch (error) {
        console.error('Failed to send confirmation email:', error);
        // Continue with redirect even if email fails
      }

      // Redirect to confirmation page
      router.push(`/bookings/confirmation?id=${booking.id}`);
    } catch (error) {
      console.error('Error creating booking:', error);
      toast.error('Failed to create booking. Please try again.');
      setIsSubmitting(false);
    }
  };

  const formatDate = (date: Date) => {
    return format(date, 'EEE, d MMM yyyy');
  };

  return (
    <div className="space-y-6">
      {/* Selected Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-green-100">
          <div className="flex items-center gap-3">
            <div className="bg-green-50 p-2 sm:p-3 rounded-full">
              <CalendarIcon className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">Selected Date</h3>
              <p className="text-lg sm:text-xl font-bold text-green-700">
                {formatDate(selectedDate)}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-green-100">
          <div className="flex items-center gap-3">
            <div className="bg-green-50 p-2 sm:p-3 rounded-full">
              <ClockIcon className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">Start Time</h3>
              <p className="text-lg sm:text-xl font-bold text-green-700">
                {selectedTime}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Booking Form */}
      <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-xl shadow-sm p-4 sm:p-6">
        {/* Duration Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Duration (in hours)
          </label>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: maxDuration }, (_, i) => i + 1).map((hours) => (
              <button
                key={hours}
                type="button"
                onClick={() => setDuration(hours)}
                className={`flex h-12 items-center justify-center rounded-lg border ${
                  duration === hours
                    ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                    : duration === 0
                    ? 'border-red-100 text-gray-700 hover:border-green-600'
                    : 'border-gray-300 text-gray-700 hover:border-green-600'
                }`}
              >
                {hours}
              </button>
            ))}
          </div>
          {errors.duration && (
            <p className="mt-1 text-sm text-red-600">{errors.duration}</p>
          )}
        </div>

        {/* Number of People */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Number of People
          </label>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setNumberOfPeople(num)}
                className={`flex h-12 items-center justify-center rounded-lg border ${
                  numberOfPeople === num
                    ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                    : 'border-gray-300 text-gray-700 hover:border-green-600'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Contact Information Section */}
        <div className="pt-4 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Contact Information</h3>
          
          {/* Phone Number */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  className={`w-full h-12 px-4 rounded-lg bg-gray-50 focus:outline-none ${
                    !phoneNumber
                      ? 'border border-red-100 focus:border-green-500 focus:ring-1 focus:ring-green-500'
                      : validatePhoneNumber(phoneNumber.replace(/\D/g, ''))
                      ? 'border border-green-500'
                      : 'border border-gray-200 focus:border-green-500 focus:ring-1 focus:ring-green-500'
                  }`}
                  placeholder="e.g., 0812345678"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Format: 0812345678 or +XX-XXX-XXXX (min. 10 digits)
              </p>
              {errors.phoneNumber && (
                <p className="mt-1 text-sm text-red-600">{errors.phoneNumber}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full h-12 px-4 rounded-lg bg-gray-50 focus:outline-none ${
                    !email
                      ? 'border border-red-100 focus:border-green-500 focus:ring-1 focus:ring-green-500'
                      : 'border border-green-500'
                  }`}
                  placeholder="your@email.com"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Booking confirmation will be sent to this email
              </p>
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email}</p>
              )}
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || !duration || !phoneNumber || !validatePhoneNumber(phoneNumber.replace(/\D/g, '')) || !email}
          className={`relative w-full h-12 rounded-lg font-semibold transition-all ${
            isSubmitting
              ? 'bg-green-600 text-transparent'
              : duration && phoneNumber && validatePhoneNumber(phoneNumber.replace(/\D/g, '')) && email
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          <span className={`${isSubmitting ? 'opacity-0' : 'opacity-100'}`}>
            Confirm Booking
          </span>
          {isSubmitting && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center space-x-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span className="text-white">Confirming...</span>
              </div>
            </div>
          )}
        </button>
      </form>

      {/* No Availability Modal */}
      {showNoAvailabilityModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <ClockIcon className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Bay Not Available
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                All bays are currently booked for this time slot.
              </p>
              <button
                onClick={() => {
                  setShowNoAvailabilityModal(false);
                  onBack();
                }}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
              >
                Select Another Time
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 