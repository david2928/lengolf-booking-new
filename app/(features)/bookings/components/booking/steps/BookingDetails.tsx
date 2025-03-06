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
import type { Session } from 'next-auth';
import { matchProfileWithCrm } from '@/utils/customer-matching';

interface Profile {
  name: string;
  email: string | null;
  phone_number: string | null;
  display_name: string;
  updated_at?: string;
}

interface BookingNotification {
  customerName: string;
  email: string;
  phoneNumber: string;
  bookingDate: string;
  bookingStartTime: string;
  bookingEndTime: string;
  bayNumber: string;
  duration: number;
  numberOfPeople: number;
  crmCustomerId?: string;
  profileId?: string;
}

// Define the session user type to match what we actually have
interface ExtendedUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  provider?: string;
  phone?: string | null;
}

interface ExtendedSession extends Omit<Session, 'user'> {
  user: ExtendedUser;
}

interface BookingDetailsProps {
  selectedDate: Date;
  selectedTime: string;
  maxDuration: number;
  onBack: () => void;
}

// Add loading animation components
const LoadingOverlay = ({ steps, currentStep }: { steps: string[], currentStep: number }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
        <div className="text-center mb-4">
          <div className="inline-block animate-bounce">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
              <circle cx="12" cy="8" r="7" />
              <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
            </svg>
          </div>
          <h3 className="text-xl font-bold mt-2">Confirming Your Booking</h3>
          <p className="text-gray-600">Please wait while we process your reservation</p>
        </div>
        
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={index} className="flex items-center">
              <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                index < currentStep ? 'bg-green-100 text-green-600' : 
                index === currentStep ? 'bg-green-600 text-white animate-pulse' : 
                'bg-gray-100 text-gray-400'
              }`}>
                {index < currentStep ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <div className="ml-4">
                <p className={`font-medium ${
                  index < currentStep ? 'text-green-600' : 
                  index === currentStep ? 'text-gray-900' : 
                  'text-gray-400'
                }`}>
                  {step}
                </p>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-green-600 h-2.5 rounded-full transition-all duration-500 ease-in-out" 
              style={{ width: `${Math.min((currentStep / (steps.length - 1)) * 100, 100)}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};

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
  const [loadingStep, setLoadingStep] = useState(0);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [errors, setErrors] = useState({
    duration: '',
    phoneNumber: '',
    email: '',
    name: '',
  });
  const [showNoAvailabilityModal, setShowNoAvailabilityModal] = useState(false);
  const [crmCustomerId, setCrmCustomerId] = useState<string | null>(null);
  const loadingSteps = [
    "Checking availability",
    "Securing your booking slot",
    "Sending confirmation details",
    "Finalizing your booking"
  ];

  useEffect(() => {
    const fetchProfile = async () => {
      if (session?.user?.id) {
        try {
          const userId = session.user.id;
          const supabase = createClient();
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

          if (error) {
            console.error('Error fetching profile:', error);
          } else if (data) {
            // Set the profile data
            setProfile(data);
            
            // Prefill the form with user data
            setName(data.display_name || data.name || session?.user?.name || '');
            setEmail(data.email || session?.user?.email || '');
            setPhoneNumber(data.phone_number || session?.user?.phone || '');
            
            // Try to match with CRM
            try {
              const response = await fetch('/api/crm/match', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ profileId: userId }),
              });

              if (response.ok) {
                const result = await response.json();
                if (result.success && result.result?.matched) {
                  setCrmCustomerId(result.result.crmCustomerId);
                }
              }
            } catch (error) {
              console.error('Error matching profile with CRM:', error);
            }
          }
        } catch (err) {
          console.error('Failed to fetch profile:', err);
        }
      }
    };

    fetchProfile();
  }, [session?.user?.id, session?.user?.name, session?.user?.email, session?.user?.phone]);

  useEffect(() => {
    if (isSubmitting && loadingStep < loadingSteps.length - 1) {
      const timer = setTimeout(() => {
        setLoadingStep(prevStep => Math.min(prevStep + 1, loadingSteps.length - 2));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isSubmitting, loadingStep, loadingSteps.length]);

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
    setShowLoadingOverlay(true);
    setLoadingStep(0);
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
      
      // Attempt to match the customer with a CRM record BEFORE sending notifications
      // Wait for CRM match to complete to ensure it's available for notifications
      let crmId = crmCustomerId;
      try {
        const response = await fetch('/api/crm/match', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            profileId: session.user.id
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.result?.matched) {
            crmId = result.result.crmCustomerId;
            setCrmCustomerId(result.result.crmCustomerId);
          }
        }
      } catch (err) {
        console.error(`Error matching profile ${session.user.id} with CRM:`, err);
        // Continue without CRM match
      }

      // Create calendar event
      setLoadingStep(prevStep => prevStep + 1);
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

      // Send LINE notification with the resolved CRM ID
      setLoadingStep(prevStep => prevStep + 1);
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
          crmCustomerId: crmId || undefined,
          profileId: session.user.id,
        });
      } catch (error) {
        console.error('Failed to send LINE notification:', error);
        // Continue with redirect even if LINE notification fails
      }

      // Send confirmation email
      setLoadingStep(prevStep => prevStep + 1);
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
            phoneNumber,
            date: format(selectedDate, 'MMMM d, yyyy'),
            startTime: selectedTime,
            endTime,
            duration,
            numberOfPeople,
            bayNumber: bay || undefined,
            userId: session.user.id
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
      setLoadingStep(loadingSteps.length - 1); // Set to final step only after everything is done
      router.push(`/bookings/confirmation?id=${booking.id}`);
    } catch (error) {
      console.error('Error creating booking:', error instanceof Error ? error.message : error);
      toast.error('Failed to create booking. Please try again.');
    } finally {
      setIsSubmitting(false);
      setShowLoadingOverlay(false);
    }
  };

  const formatDate = (date: Date) => {
    return format(date, 'EEE, do MMM yyyy');
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
        <div className="flex space-x-3 justify-end mt-6">
          <button
            type="button"
            onClick={onBack}
            className="py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            disabled={isSubmitting}
          >
            Back
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={
              isSubmitting || 
              !duration || 
              !phoneNumber || 
              !validatePhoneNumber(phoneNumber) || 
              !name ||
              !email
            }
            className={`py-2 px-6 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
              isSubmitting
                ? 'bg-green-600 opacity-75'
                : duration && phoneNumber && validatePhoneNumber(phoneNumber) && name && email
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? 'Processing...' : 'Confirm Booking'}
          </button>
        </div>
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

      {/* Add the loading overlay */}
      {showLoadingOverlay && (
        <LoadingOverlay steps={loadingSteps} currentStep={loadingStep} />
      )}
    </div>
  );
}