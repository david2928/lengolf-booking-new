'use client';

import { useState, useEffect } from 'react';
import { CalendarIcon, ClockIcon } from '@heroicons/react/24/outline';
import { format, addHours } from 'date-fns';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import { sendBookingNotification } from '@/lib/lineNotifyService';
import { useSession } from 'next-auth/react';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { Session } from 'next-auth';
import { matchProfileWithCrm } from '@/utils/customer-matching-service';

interface Profile {
  name: string;
  email: string | null;
  phone_number: string | null;
  display_name: string;
  updated_at?: string;
}

interface ExtendedSession extends Session {
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    provider?: string;
    phone?: string | null;
  }
}

interface BookingDetailsProps {
  selectedDate: Date;
  selectedTime: string;
  maxDuration: number;
  onBack: () => void;
}

export function BookingDetails({
  selectedDate,
  selectedTime,
  maxDuration,
  onBack,
}: BookingDetailsProps) {
  const router = useRouter();
  const { data: session } = useSession() as { data: ExtendedSession | null };
  const [duration, setDuration] = useState<number>(1);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [numberOfPeople, setNumberOfPeople] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({
    duration: '',
    phoneNumber: '',
    email: '',
    name: '',
  });
  const [showNoAvailabilityModal, setShowNoAvailabilityModal] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!session?.user?.id) return;

      const supabase = createClient();

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
          return;
        }

        setProfile(profile);
        setPhoneNumber(profile?.phone_number || session?.user?.phone || '');
        setName(profile?.display_name || session?.user?.name || '');
        setEmail(profile?.email || session?.user?.email || '');
      } catch (error) {
        console.error('Error in fetchProfile:', error);
      }
    };

    fetchProfile();
  }, [session?.user]);

  const validatePhoneNumber = (phone: string) => {
    // Allow international format with + prefix and 10-15 digits
    const phoneRegex = /^\+?[0-9]{10,15}$/;
    return phoneRegex.test(phone);
  };

  const validateForm = () => {
    if (!name || !phoneNumber || !email) {
      toast.error('Please fill in all required fields');
      return false;
    }

    if (!validatePhoneNumber(phoneNumber)) {
      toast.error('Please enter a valid phone number');
      return false;
    }

    return true;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^\d+]/g, '');
    // Allow + only at the start
    if (value === '+' || (value.startsWith('+') && value.length <= 16)) {
      setPhoneNumber(value);
    } else if (!value.includes('+') && value.length <= 15) {
      setPhoneNumber(value);
    }
  };

  const generateBookingId = () => {
    const timestamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randomNum = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `BK${timestamp}${randomNum}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    const bookingId = generateBookingId();
    const supabase = createClient();

    try {
      if (!session?.user?.id) {
        throw new Error('User not authenticated');
      }

      if (!profile) {
        throw new Error('Profile not loaded');
      }

      // Update profile with latest customer info
      const updateData: Partial<Profile> = {
        updated_at: new Date().toISOString()
      };
      
      if (name !== profile.name && name !== profile.display_name) {
        updateData.name = name;
      }
      if (email !== profile.email) {
        updateData.email = email;
      }
      if (phoneNumber !== profile.phone_number) {
        updateData.phone_number = phoneNumber;
      }
      
      if (Object.keys(updateData).length > 1) { // > 1 because we always include updated_at
        const { error: updateProfileError } = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', session.user.id);

        if (updateProfileError) {
          console.error('Error updating profile:', updateProfileError);
        }
      }

      // Create booking record
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          id: bookingId,
          user_id: session.user.id,
          date: format(selectedDate, 'yyyy-MM-dd'),
          start_time: selectedTime,
          duration,
          number_of_people: numberOfPeople,
          name,
          email,
          phone_number: phoneNumber,
          status: 'confirmed'
        })
        .select()
        .single();

      if (bookingError || !booking) {
        console.error('Error creating booking:', bookingError);
        toast.error('Failed to create booking. Please try again.');
        return;
      }
      
      // Attempt to match the customer with a CRM record
      // This runs in the background and doesn't block the booking process
      matchProfileWithCrm(session.user.id).then(result => {
        if (result?.matched) {
          console.log(`Profile ${session.user.id} automatically matched with CRM customer ${result.crmCustomerId} (confidence: ${result.confidence})`);
        }
      }).catch(err => {
        console.error(`Error matching profile ${session.user.id} with CRM:`, err);
      });

      // Create calendar event
      const response = await fetch('/api/bookings/calendar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bookingId: booking.id,
          date: format(selectedDate, 'yyyy-MM-dd'),
          startTime: selectedTime,
          duration,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error === 'No bays available for the selected time slot') {
          // Delete the booking since no bay is available
          const { error: deleteError } = await supabase
            .from('bookings')
            .delete()
            .eq('id', booking.id);

          if (deleteError) {
            console.error('Error deleting booking:', deleteError);
          }

          setShowNoAvailabilityModal(true);
          return;
        }
        throw new Error(errorData.error || 'Failed to create calendar event');
      }

      const { bay } = await response.json();

      // Update booking with bay information
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ bay })
        .eq('id', booking.id);

      if (updateError) {
        console.error('Error updating booking:', updateError);
        toast.error('Failed to update booking. Please try again.');
        return;
      }

      // Send LINE notification
      try {
        const endTime = format(
          addHours(new Date(`${selectedDate.toISOString().split('T')[0]}T${selectedTime}`), duration),
          'HH:mm'
        );

        await sendBookingNotification({
          customerName: name,
          email,
          phoneNumber,
          bookingDate: format(selectedDate, 'yyyy-MM-dd'),
          bookingStartTime: selectedTime,
          bookingEndTime: endTime,
          bayNumber: bay || 'Not assigned',
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
            userName: name,
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

      toast.success('Booking confirmed!');
      router.push(`/bookings/confirmation?id=${booking.id}`);
    } catch (error) {
      console.error('Error creating booking:', error instanceof Error ? error.message : error);
      toast.error('Failed to create booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (date: Date) => {
    return format(date, 'EEE, d MMM yyyy');
  };

  const isLineUser = session?.user?.provider === 'line';

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
          
          <div className="space-y-4">
            {/* Name field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full h-12 px-4 rounded-lg bg-gray-50 focus:outline-none ${
                  !name ? 'border-red-100' : 'border-green-500'
                } border focus:border-green-500 focus:ring-1 focus:ring-green-500`}
                placeholder="Enter your name"
              />
            </div>

            {/* Phone Number */}
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
                  placeholder={isLineUser ? "Enter your email address" : "your@email.com"}
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
          disabled={
            isSubmitting || 
            !duration || 
            !phoneNumber || 
            !validatePhoneNumber(phoneNumber) || 
            !name ||
            !email
          }
          className={`relative w-full h-12 rounded-lg font-semibold transition-all ${
            isSubmitting
              ? 'bg-green-600 text-transparent'
              : duration && phoneNumber && validatePhoneNumber(phoneNumber) && name && email
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