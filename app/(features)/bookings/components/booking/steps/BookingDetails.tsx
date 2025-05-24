'use client';

import { useState, useEffect } from 'react';
import { CalendarIcon, ClockIcon } from '@heroicons/react/24/outline';
import { format, addHours } from 'date-fns';
import { createClient } from '@/utils/supabase/client';
import type { Database } from '@/types/supabase';
import { useRouter } from 'next/navigation';
import { User, SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import { useSession } from 'next-auth/react';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import type { Session } from 'next-auth';
import { matchProfileWithCrm } from '@/utils/customer-matching';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

interface Profile {
  name: string;
  email: string | null;
  phone_number: string | null;
  display_name: string;
  updated_at?: string;
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
  accessToken?: string;  // Add accessToken to the session type
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
  const { data: session, status } = useSession() as { data: ExtendedSession | null, status: 'loading' | 'authenticated' | 'unauthenticated' };
  const [duration, setDuration] = useState<number>(1);
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [numberOfPeople, setNumberOfPeople] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [customerNotes, setCustomerNotes] = useState('');
  const [vipDataPrepopulated, setVipDataPrepopulated] = useState(false);
  const [errors, setErrors] = useState({
    duration: '',
    phoneNumber: '',
    email: '',
    name: '',
  });
  const [showNoAvailabilityModal, setShowNoAvailabilityModal] = useState(false);
  const [crmCustomerId, setCrmCustomerId] = useState<string | null>(null);
  const [hasBookingError, setHasBookingError] = useState(false);
  const loadingSteps = [
    "Checking availability",
    "Creating your booking",
    "Sending notifications",
    "Booking confirmed!"
  ];

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    // Enhanced logging for session and accessToken
    console.log("[BookingDetails SupabaseSetupEffect] Status:", status);
    if (session) {
      console.log("[BookingDetails SupabaseSetupEffect] Session object:", JSON.stringify(session, null, 2));
      console.log("[BookingDetails SupabaseSetupEffect] Session Access Token for Supabase:", session.accessToken);
    } else {
      console.log("[BookingDetails SupabaseSetupEffect] No session object.");
    }

    const client = createClient(); // Get the singleton instance from '@/utils/supabase/client'

    const setupSupabaseAuth = async () => {
      if (session?.accessToken) {
        console.log("[BookingDetails SupabaseSetupEffect] Setting Supabase client auth WITH session.accessToken:", session.accessToken);
        await client.auth.setSession({ 
          access_token: session.accessToken,
          refresh_token: '' // Provide an empty string for the required refresh_token field
        });
      } else {
        console.log("[BookingDetails SupabaseSetupEffect] No session.accessToken. Signing out Supabase client to ensure anon state.");
        // Use signOut() to clear the session on the client instance and revert to anon.
        await client.auth.signOut();
      }
      setSupabase(client);
    };

    if (status !== 'loading') { // Only run if session status is determined
      setupSupabaseAuth();
    } else {
      console.log("[BookingDetails SupabaseSetupEffect] Supabase client setup deferred as session status is loading.");
    }
  }, [session, status]);

  // Fetch VIP profile data when authenticated
  useEffect(() => {
    const fetchVipProfile = async () => {
      if (status === 'authenticated' && session?.user?.id && !vipDataPrepopulated) {
        console.log("[BookingDetails VIP Profile] Fetching VIP profile data for user:", session.user.id);
        
        try {
          // Try to get cached VIP profile data first from context
          // This would require access to VIP context which isn't available here
          // So let's check for cached data in sessionStorage as a fallback
          const cachedVipProfileKey = `vip_profile_${session.user.id}`;
          const cachedVipProfile = sessionStorage.getItem(cachedVipProfileKey);
          
          let vipProfile = null;
          
          if (cachedVipProfile) {
            try {
              const parsedCached = JSON.parse(cachedVipProfile);
              const cacheAge = Date.now() - (parsedCached.timestamp || 0);
              const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
              
              if (cacheAge < CACHE_EXPIRY_MS) {
                vipProfile = parsedCached.data;
                console.log("[BookingDetails VIP Profile] Using cached VIP profile data (age:", cacheAge, "ms)");
              }
            } catch (e) {
              console.warn("[BookingDetails VIP Profile] Invalid cached data, will fetch fresh");
            }
          }
          
          // If no valid cached data, fetch from API
          if (!vipProfile) {
            console.log("[BookingDetails VIP Profile] Fetching fresh VIP profile data from API");
            const response = await fetch('/api/vip/profile', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
            });

            if (response.ok) {
              vipProfile = await response.json();
              
              // Cache the result
              sessionStorage.setItem(cachedVipProfileKey, JSON.stringify({
                data: vipProfile,
                timestamp: Date.now()
              }));
              console.log("[BookingDetails VIP Profile] Cached fresh VIP profile data");
            } else if (response.status === 401) {
              console.log("[BookingDetails VIP Profile] User not authorized for VIP profile - will fall back to session data");
              return;
            } else {
              console.warn("[BookingDetails VIP Profile] Failed to fetch VIP profile:", response.status, response.statusText);
              return;
            }
          }
          
          if (vipProfile) {
            console.log("[BookingDetails VIP Profile] VIP profile data received:", vipProfile);
            
            // Prepopulate form with VIP data if available and valid
            if (vipProfile.name) {
              setName(vipProfile.name);
              console.log("[BookingDetails VIP Profile] Set name from VIP profile:", vipProfile.name);
            }
            if (vipProfile.email) {
              setEmail(vipProfile.email);
              console.log("[BookingDetails VIP Profile] Set email from VIP profile:", vipProfile.email);
            }
            if (vipProfile.phoneNumber) {
              // Format phone number to E.164 if needed
              let formattedPhoneNumber = vipProfile.phoneNumber;
              
              // If the phone number doesn't start with +, format it
              if (!formattedPhoneNumber.startsWith('+')) {
                // For Thai numbers: convert 0842695447 to +66842695447, or 842695447 to +66842695447
                if (formattedPhoneNumber.startsWith('0') && formattedPhoneNumber.length === 10) {
                  formattedPhoneNumber = '+66' + formattedPhoneNumber.substring(1);
                } else if (formattedPhoneNumber.length === 9) {
                  formattedPhoneNumber = '+66' + formattedPhoneNumber;
                }
                // Add more country-specific rules if needed
              }
              
              setPhoneNumber(formattedPhoneNumber);
              console.log("[BookingDetails VIP Profile] Set phone from VIP profile:", formattedPhoneNumber, "(original:", vipProfile.phoneNumber + ")");
            }
            if (vipProfile.crmCustomerId) {
              setCrmCustomerId(vipProfile.crmCustomerId);
              console.log("[BookingDetails VIP Profile] Set CRM customer ID:", vipProfile.crmCustomerId);
            }
            
            setVipDataPrepopulated(true);
            console.log("[BookingDetails VIP Profile] VIP data prepopulation completed successfully");
          }
        } catch (error) {
          console.error("[BookingDetails VIP Profile] Error fetching VIP profile:", error);
        }
      }
    };

    fetchVipProfile();
  }, [status, session?.user?.id, vipDataPrepopulated]);

  useEffect(() => {
    const fetchProfile = async () => {
      console.log("[BookingDetails Profile] fetchProfile called. Supabase client defined?", !!supabase, "Session user ID:", session?.user?.id);
      if (supabase && session?.user?.id && !vipDataPrepopulated) {
        try {
          const userId = session.user.id;
          const { data, error } = await supabase
            .from('profiles_vip_staging')
            .select('*')
            .eq('id', userId)
            .single();

          if (error) {
            console.error('Error fetching profile:', error);
          } else if (data) {
            // Set the profile data
            setProfile(data);
            
            // Only prefill the form with basic profile data if VIP data wasn't already prepopulated
            console.log("[BookingDetails Profile] Setting fallback profile data from profiles_vip_staging");
            setName(data.display_name || data.name || session?.user?.name || '');
            setEmail(data.email || session?.user?.email || '');
            
            let initialPhoneNumber = data.phone_number || session?.user?.phone || '';
            if (initialPhoneNumber && !initialPhoneNumber.startsWith('+')) {
              // Basic assumption: if it's a 10-digit number starting with 0, assume it's a Thai number
              if (initialPhoneNumber.length === 10 && initialPhoneNumber.startsWith('0')) {
                initialPhoneNumber = '+66' + initialPhoneNumber.substring(1);
              }
              // Add more rules if necessary for other common local formats
            }
            setPhoneNumber(initialPhoneNumber || undefined); // Set to undefined if empty for placeholder to show
          }
        } catch (err) {
          console.error('Failed to fetch profile:', err);
        }
      }
    };

    // Only fetch basic profile if VIP profile fetch didn't already populate the data
    if (!vipDataPrepopulated) {
      fetchProfile();
    }
  }, [supabase, session?.user?.id, session?.user?.name, session?.user?.email, session?.user?.phone, vipDataPrepopulated]);

  useEffect(() => {
    if (isSubmitting && loadingStep < loadingSteps.length - 1) {
      // Create a more consistent animation with timed steps
      const stepTimes = [1000, 1500, 1500]; // Time to spend on each step
      const timer = setTimeout(() => {
        setLoadingStep(prevStep => {
          const nextStep = prevStep + 1;
          return Math.min(nextStep, loadingSteps.length - 2);
        });
      }, stepTimes[loadingStep] || 1000);
      return () => clearTimeout(timer);
    }
  }, [isSubmitting, loadingStep, loadingSteps.length]);

  const validateForm = () => {
    let currentErrors = { duration: '', phoneNumber: '', email: '', name: '' };
    let isValid = true;

    if (!name) {
      currentErrors.name = 'Name is required';
      isValid = false;
    }
    if (!email) {
      currentErrors.email = 'Email is required';
      isValid = false;
    }
    // Updated phone number validation
    if (!phoneNumber) {
      currentErrors.phoneNumber = 'Phone number is required';
      isValid = false;
    } else if (!isValidPhoneNumber(phoneNumber)) {
      currentErrors.phoneNumber = 'Please enter a valid phone number';
      isValid = false;
    }

    setErrors(currentErrors);

    if (!isValid) {
      // Consolidate toast messages or show one generic message
      toast.error('Please fill in all required fields correctly.');
    }
    return isValid;
  };

  const generateBookingId = () => {
    const timestamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randomNum = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `BK${timestamp}${randomNum}`;
  };

  // Helper function to ensure minimum animation duration
  const ensureMinimumAnimationDuration = async (startTime: number, minDuration: number = 3000) => {
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime < minDuration) {
      await new Promise(resolve => setTimeout(resolve, minDuration - elapsedTime));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!supabase) {
      toast.error('Booking system is not ready. Please try again in a moment.');
      console.error('Attempted to submit booking but Supabase client is not initialized.');
      return;
    }

    if (!validateForm()) {
      return;
    }

    if (!session) {
      toast.error('Please sign in to continue');
      router.push('/auth/signin');
      return;
    }

    // Start timing the submission process
    const submissionStartTime = Date.now();
    setIsSubmitting(true);
    setShowLoadingOverlay(true);
    setLoadingStep(0);
    
    let determinedStableHashId: string | null = null;

    try {
      if (!session?.user?.id) {
        throw new Error('User not authenticated');
      }
      const profileId = session.user.id;

      // --- BEGIN: Determine stable_hash_id ---
      if (supabase) { // Ensure supabase client is available
        // 1. Attempt to get from profiles_vip_staging -> vip_customer_data
        const { data: profileVipStagingData, error: profileVipError } = await supabase
          .from('profiles_vip_staging')
          .select('vip_customer_data_id')
          .eq('id', profileId)
          .single();

        if (profileVipError) {
          console.warn('[BookingDetails] Error fetching vip_customer_data_id from profiles_vip_staging:', profileVipError.message);
        }

        if (profileVipStagingData?.vip_customer_data_id) {
          const { data: vipData, error: vipDataError } = await supabase
            .from('vip_customer_data')
            .select('stable_hash_id')
            .eq('id', profileVipStagingData.vip_customer_data_id)
            .single();
          
          if (vipDataError) {
            console.warn('[BookingDetails] Error fetching stable_hash_id from vip_customer_data:', vipDataError.message);
          }

          if (vipData?.stable_hash_id) {
            determinedStableHashId = vipData.stable_hash_id;
            console.log('[BookingDetails] Determined stable_hash_id from vip_customer_data:', determinedStableHashId);
          }
        }

        // 2. Fallback to crm_customer_mapping_vip_staging if not found via vip_customer_data
        if (!determinedStableHashId) {
          const { data: crmMapData, error: crmMapError } = await supabase
            .from('crm_customer_mapping_vip_staging')
            .select('stable_hash_id, is_matched')
            .eq('profile_id', profileId) // Assuming profileId from session can be used here
            .single();

          if (crmMapError) {
            console.warn('[BookingDetails] Error fetching stable_hash_id from crm_customer_mapping_vip_staging:', crmMapError.message);
          }

          if (crmMapData?.is_matched && crmMapData.stable_hash_id) {
            determinedStableHashId = crmMapData.stable_hash_id;
            console.log('[BookingDetails] Determined stable_hash_id from crm_customer_mapping_vip_staging:', determinedStableHashId);
          }
        }
        if (!determinedStableHashId) {
            console.log('[BookingDetails] Could not determine stable_hash_id for user:', profileId);
        }
      } else {
        console.warn('[BookingDetails] Supabase client not initialized, cannot determine stable_hash_id.');
      }
      // --- END: Determine stable_hash_id ---
      
      // Check if we need to update the user profile
      const profileNeedsUpdate = 
        profile && (
          profile.name !== name || 
          profile.email !== email || 
          profile.phone_number !== phoneNumber ||
          profile.display_name !== name
        );
      
      // Update profile if needed
      if (profileNeedsUpdate && session?.user?.id) {
        const { data, error } = await supabase
          .from('profiles_vip_staging')
          .update({
            display_name: name,
            email: email,
            phone_number: phoneNumber,
            updated_at: new Date().toISOString()
          })
          .eq('id', session.user.id);
      }

      // Step 1: Create the booking record
      setLoadingStep(0); // Checking availability
      const createResponse = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.accessToken || ''}`
        },
        body: JSON.stringify({
          date: format(selectedDate, 'yyyy-MM-dd'),
          start_time: selectedTime,
          duration,
          number_of_people: numberOfPeople,
          name,
          email,
          phone_number: phoneNumber,
          stable_hash_id: determinedStableHashId,
          customer_notes: customerNotes
        })
      });
      
      if (!createResponse.ok) {
        let errorMessage = 'Failed to create booking';
        try {
          const errorData = await createResponse.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (parseError) {
          errorMessage = `API Error: ${createResponse.status} ${createResponse.statusText}`;
        }
        throw new Error(errorMessage);
      }
      
      const createData = await createResponse.json();
      
      // Check if booking data exists in the response
      if (!createData || !createData.booking) {
        throw new Error('Invalid response from booking creation');
      }
      
      const { booking, bayDisplayName, notificationsSuccess } = createData;
      
      if (createData.crmCustomerId) {
        setCrmCustomerId(createData.crmCustomerId);
      }
      
      // If notifications failed, show a warning but continue
      if (notificationsSuccess === false) {
        toast.error('Your booking was created, but there was an issue sending confirmation messages. Staff will be in touch shortly.');
      }
      
      // Step 2: Ensure we've shown the processing steps long enough for a good UX
      await ensureMinimumAnimationDuration(submissionStartTime, 3000);
      
      // Step 3: Booking confirmed, set to final step
      setLoadingStep(loadingSteps.length - 1);
      
      // Wait for a moment to let the user see the confirmation step
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Redirect to confirmation page
      const url = `/bookings/confirmation?id=${booking.id}`;
      router.push(url);
      
    } catch (error) {
      console.error('Error in booking process:', error);
      toast.error(error instanceof Error ? error.message : 'An error occurred during booking');
      setIsSubmitting(false);
      setShowLoadingOverlay(false);
    }
  };

  const formatDate = (date: Date) => {
    return format(date, 'EEE, do MMM yyyy');
  };

  const isLineUser = session?.user?.provider === 'line';

  // Show loading state while session is being fetched
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
      </div>
    );
  }

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
                <PhoneInput
                  international
                  defaultCountry="TH"
                  placeholder="Enter phone number"
                  value={phoneNumber}
                  onChange={setPhoneNumber}
                  className={`w-full h-12 px-3 py-2 rounded-lg bg-gray-50 focus:outline-none border focus:border-green-500 focus:ring-1 focus:ring-green-500 custom-phone-input ${
                    errors.phoneNumber 
                      ? 'border-red-500' 
                      : (phoneNumber && isValidPhoneNumber(phoneNumber || '')) 
                      ? 'border-green-500' 
                      : 'border-gray-200'
                  }`}
                />
              </div>
              {/* Helper text to guide country selection if number is empty */}
              {!phoneNumber && (
                <p className="mt-1 text-xs text-gray-500">
                  Please select your country code and enter your phone number.
                </p>
              )}
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

        {/* Add Customer Notes/Special Requests field */}
        <div>
          <label htmlFor="customerNotes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes / Requests (Optional)
          </label>
          <textarea
            id="customerNotes"
            value={customerNotes}
            onChange={(e) => setCustomerNotes(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none text-sm sm:text-base"
            placeholder="e.g., specific club preferences, coaching add-on interest, specific simulator bay?"
          />
          <p className="mt-1 text-xs sm:text-sm text-gray-500">
            Mention specific club preferences, promotions, coaching interest, or other requests here.
          </p>
        </div>

        {/* Fine print about communications */}
        <div className="mt-2">
          <p className="text-xs text-gray-500">
            By placing a booking, you agree to receive communications regarding your booking status. If this is your first booking, you will also receive a follow-up message inviting you to rate your visit.
          </p>
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
            disabled={
              isSubmitting || 
              !duration || 
              !phoneNumber || 
              !isValidPhoneNumber(phoneNumber || '') ||
              !name ||
              !email
            }
            className={`py-2 px-6 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
              isSubmitting
                ? 'bg-green-600 opacity-75'
                : (duration && phoneNumber && isValidPhoneNumber(phoneNumber || '') && name && email)
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