'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CalendarIcon,
  ClockIcon,
  CheckIcon,
  UsersIcon,
  ComputerDesktopIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { createClient } from '@/utils/supabase/client';
import type { Database } from '@/types/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import { useSession } from 'next-auth/react';
import type { Session } from 'next-auth';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import type { PlayFoodPackage } from '@/types/play-food-packages';
import { PLAY_FOOD_PACKAGES } from '@/types/play-food-packages';
import { GOLF_CLUB_PRICING, formatClubRentalInfo } from '@/types/golf-club-rental';
import { BayType } from '@/lib/bayConfig';
import { BayInfoModal } from '../../BayInfoModal';
import type { TimeSlot } from '../../../hooks/useAvailability';

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
  selectedBayType?: BayType | null;
  maxDuration: number;
  slotData?: TimeSlot | null;
  onBack: () => void;
  selectedPackage?: PlayFoodPackage | null;
  fixedPeople?: number | null;
  isPackageMode?: boolean;
  selectedClubRental?: string;
  onClubRentalChange?: (clubId: string) => void;
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
  selectedBayType,
  maxDuration,
  slotData,
  onBack,
  selectedPackage,
  selectedClubRental = 'standard',
  onClubRentalChange,
}: BookingDetailsProps) {
  const router = useRouter();
  const { data: session, status } = useSession() as { data: ExtendedSession | null, status: 'loading' | 'authenticated' | 'unauthenticated' };
  const [duration, setDuration] = useState<number>(1);
  const [selectedBay, setSelectedBay] = useState<BayType | null>(selectedBayType || null);
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
  const [showBayInfoModal, setShowBayInfoModal] = useState(false);
  const loadingSteps = [
    "Checking availability",
    "Creating your booking",
    "Sending notifications",
    "Booking confirmed!"
  ];

  // Helper function to get bay availability for a specific duration
  const getBayAvailabilityForDuration = useCallback((dur: number) => {
    if (!slotData?.bayAvailabilityByDuration) {
      return { social: 0, ai: 0, total: 0, bays: [] };
    }
    return slotData.bayAvailabilityByDuration[dur.toString()] || { social: 0, ai: 0, total: 0, bays: [] };
  }, [slotData]);

  // Get current duration's bay availability
  const currentAvailability = getBayAvailabilityForDuration(duration);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {

    const client = createClient(); // Get the singleton instance from '@/utils/supabase/client'

    const setupSupabaseAuth = async () => {
      if (session?.accessToken) {
        await client.auth.setSession({
          access_token: session.accessToken,
          refresh_token: '' // Provide an empty string for the required refresh_token field
        });
      } else {
        // Use signOut() to clear the session on the client instance and revert to anon.
        await client.auth.signOut();
      }
      setSupabase(client);
    };

    if (status !== 'loading') { // Only run if session status is determined
      setupSupabaseAuth();
    }
  }, [session, status]);

  // Fetch VIP profile data when authenticated
  useEffect(() => {
    const fetchVipProfile = async () => {
      if (status === 'authenticated' && session?.user?.id && !vipDataPrepopulated) {
        
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
              }
            } catch {
              // Invalid cached data, will fetch fresh
            }
          }
          
          // If no valid cached data, fetch from API
          if (!vipProfile) {
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
            } else if (response.status === 401) {
              return;
            } else {
              return;
            }
          }
          
          if (vipProfile) {
            
            // Prepopulate form with VIP data if available and valid
            if (vipProfile.name) {
              setName(vipProfile.name);
            }
            if (vipProfile.email) {
              setEmail(vipProfile.email);
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
            }
            
            setVipDataPrepopulated(true);
          }
        } catch {
          // Error fetching VIP profile
        }
      }
    };

    fetchVipProfile();
  }, [status, session?.user?.id, vipDataPrepopulated]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (supabase && session?.user?.id && !vipDataPrepopulated) {
        try {
          const userId = session.user.id;
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('display_name, phone_number, email')
            .eq('id', userId)
            .single();

          if (profileError) {
            // Error fetching profile
          } else if (profileData) {
            setProfile({
              name: profileData.display_name || '',
              email: profileData.email || '',
              phone_number: profileData.phone_number || '',
              display_name: profileData.display_name || ''
            });
          }
        } catch {
          // Failed to fetch profile
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

  // Pre-fill form when package is selected
  useEffect(() => {
    if (selectedPackage) {
      setDuration(selectedPackage.duration);
      // Don't auto-set number of people - let user choose
    }
  }, [selectedPackage]);

  // Auto-select bay when only one type is available (e.g., AI Lab is N/A, auto-select Social)
  useEffect(() => {
    if (!selectedBayType && slotData?.bayAvailabilityByDuration) {
      const availability = getBayAvailabilityForDuration(duration);

      if (!selectedBay) {
        // Nothing selected yet - auto-select the only available bay type
        if (availability.social > 0 && availability.ai === 0) {
          setSelectedBay('social');
        } else if (availability.ai > 0 && availability.social === 0) {
          setSelectedBay('ai_lab');
        }
      } else {
        // Bay is selected but became unavailable due to duration change - auto-switch
        if (selectedBay === 'social' && availability.social === 0 && availability.ai > 0) {
          setSelectedBay('ai_lab');
          toast('Duration changed: Switched to AI Bay (Social bays not available for this duration)', {
            icon: 'ℹ️',
            duration: 4000,
          });
        } else if (selectedBay === 'ai_lab' && availability.ai === 0 && availability.social > 0) {
          setSelectedBay('social');
          toast('Duration changed: Switched to Social Bay (AI bay not available for this duration)', {
            icon: 'ℹ️',
            duration: 4000,
          });
        }
      }
    }
  }, [duration, selectedBay, selectedBayType, slotData, getBayAvailabilityForDuration]);

  // Local state for package selector to allow switching
  const [localSelectedPackage, setLocalSelectedPackage] = useState<PlayFoodPackage | null>(selectedPackage || null);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [showClubRentalModal, setShowClubRentalModal] = useState(false);

  // Update local state when selectedPackage changes
  useEffect(() => {
    setLocalSelectedPackage(selectedPackage || null);
  }, [selectedPackage]);

  const validateForm = () => {
    const currentErrors = { duration: '', phoneNumber: '', email: '', name: '' };
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

    // Validate bay type selection when coming from "All Bays"
    if (!selectedBayType && !selectedBay) {
      toast.error('Please select a bay type to continue');
      isValid = false;
    }

    setErrors(currentErrors);

    if (!isValid && (currentErrors.name || currentErrors.email || currentErrors.phoneNumber)) {
      // Consolidate toast messages or show one generic message
      toast.error('Please fill in all required fields correctly.');
    }
    return isValid;
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
    
    try {
      if (!session?.user?.id) {
        throw new Error('User not authenticated');
      }
      
      // Prepare customer notes with club rental info
      let finalCustomerNotes = customerNotes;
      const clubRentalInfo = formatClubRentalInfo(selectedClubRental);
      if (clubRentalInfo) {
        finalCustomerNotes = finalCustomerNotes 
          ? `${finalCustomerNotes}\n${clubRentalInfo}`
          : clubRentalInfo;
      }
      
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
        await supabase
          .from('profiles')
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
          customer_notes: finalCustomerNotes,
          package_id: localSelectedPackage?.id || null,
          package_info: localSelectedPackage ? `${localSelectedPackage.name} - ${localSelectedPackage.displayName}` : null,
          preferred_bay_type: selectedBayType || selectedBay
        })
      });
      
      if (!createResponse.ok) {
        let errorMessage = 'Failed to create booking';
        try {
          const errorData = await createResponse.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `API Error: ${createResponse.status} ${createResponse.statusText}`;
        }
        throw new Error(errorMessage);
      }
      
      const createData = await createResponse.json();
      
      // Check if booking data exists in the response
      if (!createData || !createData.booking) {
        throw new Error('Invalid response from booking creation');
      }
      
      const { booking, notificationsSuccess } = createData;
      
      
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
    <div className="space-y-4 sm:space-y-6">
      {/* Selected Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6 border border-green-100">
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
        
        <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6 border border-green-100">
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

        <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6 border border-green-100">
          <div className="flex items-center gap-3">
            <div className={`p-2 sm:p-3 rounded-full ${
              (selectedBayType === 'ai_lab' || selectedBay === 'ai_lab') 
                ? 'bg-purple-50' 
                : 'bg-green-50'
            }`}>
              {(selectedBayType === 'ai_lab' || selectedBay === 'ai_lab') ? (
                <ComputerDesktopIcon className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600" />
              ) : (
                <UsersIcon className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">
                Bay Type <span className="text-red-500">*</span>
              </h3>
              {!selectedBayType ? (
                <div className="space-y-2 mt-1">
                  <div className="flex bg-gray-100 rounded-lg p-0.5">
                    <button
                      onClick={() => setSelectedBay('social')}
                      disabled={currentAvailability.social === 0}
                      className={`flex-1 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        selectedBay === 'social'
                          ? 'bg-green-600 text-white shadow-sm'
                          : currentAvailability.social === 0
                          ? 'text-gray-400 cursor-not-allowed'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      Social {currentAvailability.social === 0 && '(N/A)'}
                    </button>
                    <button
                      onClick={() => setSelectedBay('ai_lab')}
                      disabled={currentAvailability.ai === 0}
                      className={`flex-1 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        selectedBay === 'ai_lab'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : currentAvailability.ai === 0
                          ? 'text-gray-400 cursor-not-allowed'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      AI Lab {currentAvailability.ai === 0 && '(N/A)'}
                    </button>
                  </div>
                  <button
                    onClick={() => setShowBayInfoModal(true)}
                    className="text-xs text-gray-500 hover:text-gray-700 underline transition-colors"
                  >
                    What&apos;s the difference?
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className={`text-lg sm:text-xl font-bold ${
                    selectedBayType === 'ai_lab' ? 'text-purple-700' : 'text-green-700'
                  }`}>
                    {selectedBayType === 'ai_lab' ? 'AI Lab' : 'Social Bay'}
                  </p>
                  <button
                    onClick={() => setShowBayInfoModal(true)}
                    className="text-xs text-gray-500 hover:text-gray-700 underline transition-colors"
                  >
                    Info
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* AI Lab Group Size Warning */}
      {(selectedBayType === 'ai_lab' || selectedBay === 'ai_lab') && numberOfPeople >= 3 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
          <div className="flex items-start">
            <InformationCircleIcon className="h-5 w-5 text-yellow-400 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-yellow-800 mb-1">
                Recommendation for Best Experience
              </h4>
              <p className="text-sm text-yellow-700">
                The LENGOLF AI Lab is optimized for 1-2 experienced players for the most detailed analysis. 
                Social Bays are recommended for larger groups and beginners.
              </p>
              <button
                onClick={onBack}
                className="mt-2 text-sm text-yellow-600 hover:text-yellow-500 underline"
              >
                ← Go back to select Social Bay
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Booking Form */}
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 bg-white rounded-xl shadow-sm p-3 sm:p-6">
        {/* Play & Food Package Selection */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Play & Food Package (Optional)
            </label>
            <button 
              type="button"
              onClick={() => setShowPackageModal(true)}
              className="text-xs text-green-600 hover:text-green-700 underline"
            >
              View Details
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => {
                setLocalSelectedPackage(null);
                setDuration(1);
                setNumberOfPeople(1);
                router.replace('/bookings', { scroll: false });
              }}
              className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs relative ${
                !localSelectedPackage
                  ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                  : 'border-gray-300 text-gray-700 hover:border-green-600'
              }`}
            >
              <span className="font-semibold text-[11px] sm:text-xs">Bay Only</span>
              <span className="text-[9px] sm:text-[10px] mt-0.5 opacity-75">Normal rates</span>
            </button>
            
            {PLAY_FOOD_PACKAGES.map((pkg) => {
              const isAvailable = pkg.duration <= maxDuration;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  disabled={!isAvailable}
                  onClick={() => {
                    if (isAvailable) {
                      setLocalSelectedPackage(pkg);
                      setDuration(pkg.duration);
                      const newUrl = `/bookings?package=${pkg.id}`;
                      router.replace(newUrl, { scroll: false });
                    }
                  }}
                  className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
                    localSelectedPackage?.id === pkg.id
                      ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                      : !isAvailable
                      ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                      : 'border-gray-300 text-gray-700 hover:border-green-600'
                  }`}
                >
                  <span className="text-lg font-bold mb-1">{pkg.id.split('_')[1]}</span>
                  <span>฿{pkg.price.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
          
          {localSelectedPackage ? (
            <div className="mt-4 p-3 bg-green-50 rounded-lg">
              <div className="text-sm font-medium text-green-800 mb-2">
                {localSelectedPackage.name} - {localSelectedPackage.duration} Hour{localSelectedPackage.duration > 1 ? 's' : ''} - ฿{localSelectedPackage.price.toLocaleString()} NET
              </div>
              <div className="text-xs text-gray-600">
                <span className="font-medium">Includes:</span> Golf simulator, {localSelectedPackage.foodItems.map(f => f.name).join(', ')}, {localSelectedPackage.drinks.map(d => d.type === 'unlimited' ? `Unlimited ${d.name}` : d.type === 'per_person' ? `${d.quantity}x ${d.name} per person` : `${d.quantity}x ${d.name}`).join(', ')}
              </div>
            </div>
          ) : (
            <div className="mt-3 text-xs text-gray-500 text-center">
              Bay rental will be charged at normal hourly rates
            </div>
          )}
        </div>


        {/* Duration Selection - Only for regular bookings */}
        {!localSelectedPackage && (
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
                  className={`flex h-12 items-center justify-center rounded-lg border relative ${
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

            {/* Bay availability indicator for current duration */}
            {slotData?.bayAvailabilityByDuration && currentAvailability.total > 0 && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <InformationCircleIcon className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <span className="font-medium text-blue-900">Available for {duration} hour{duration > 1 ? 's' : ''}: </span>
                    {currentAvailability.social > 0 && currentAvailability.ai > 0 && (
                      <span className="text-blue-700">
                        {currentAvailability.social} Social Bay{currentAvailability.social > 1 ? 's' : ''} or {currentAvailability.ai} AI Bay
                      </span>
                    )}
                    {currentAvailability.social > 0 && currentAvailability.ai === 0 && (
                      <span className="text-blue-700">
                        {currentAvailability.social} Social Bay{currentAvailability.social > 1 ? 's' : ''} only
                      </span>
                    )}
                    {currentAvailability.social === 0 && currentAvailability.ai > 0 && (
                      <span className="text-blue-700">
                        AI Bay only
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

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

        {/* Golf Club Rental Selection */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Golf Club Rental (Optional)
            </label>
            <button 
              type="button"
              onClick={() => setShowClubRentalModal(true)}
              className="text-xs text-green-600 hover:text-green-700 underline"
            >
              View Details
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onClubRentalChange?.('standard')}
              className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
                selectedClubRental === 'standard'
                  ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                  : 'border-gray-300 text-gray-700 hover:border-green-600'
              }`}
            >
              <span className="font-semibold text-[11px] sm:text-xs">Standard Set</span>
              <span className="text-[9px] sm:text-[10px] mt-0.5 opacity-75 text-gray-500">Free</span>
            </button>

            <button
              type="button"
              onClick={() => onClubRentalChange?.('none')}
              className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
                selectedClubRental === 'none'
                  ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                  : 'border-gray-300 text-gray-700 hover:border-green-600'
              }`}
            >
              <span className="font-semibold text-[11px] sm:text-xs">No Rental</span>
              <span className="text-[9px] sm:text-[10px] mt-0.5 opacity-75">Own clubs</span>
            </button>

            <button
              type="button"
              onClick={() => onClubRentalChange?.('premium-mens')}
              className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
                selectedClubRental === 'premium-mens'
                  ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                  : 'border-gray-300 text-gray-700 hover:border-green-600'
              }`}
            >
              <span className="font-semibold text-[11px] sm:text-xs">
                <span className="text-green-600 font-bold">Premium</span> Clubs
              </span>
              <span className="text-[10px] sm:text-xs mt-0.5 opacity-75">฿150+</span>
            </button>
          </div>
          
          {selectedClubRental === 'premium-mens' && (
            <div className="mt-3 p-3 bg-green-50 rounded-lg">
              <div className="text-sm font-medium text-green-800 mb-1">Premium Clubs Selected</div>
              <div className="text-xs text-gray-600">
                Pricing: 1hr ฿150 • 2hrs ฿250 • 4hrs ฿400 • Full day ฿1,200
              </div>
            </div>
          )}
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
              !email ||
              (!selectedBayType && !selectedBay)
            }
            className={`py-2 px-6 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
              isSubmitting
                ? 'bg-green-600 opacity-75'
                : (duration && phoneNumber && isValidPhoneNumber(phoneNumber || '') && name && email && (selectedBayType || selectedBay))
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

      {/* Package Details Modal */}
      {showPackageModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowPackageModal(false)} />
          <div className="fixed inset-0 flex items-end sm:items-center justify-center z-50 sm:p-4">
            <div className="bg-white rounded-t-xl sm:rounded-xl w-full sm:max-w-4xl max-h-[85vh] sm:max-h-[90vh] overflow-hidden relative flex flex-col">
              {/* Close button */}
              <button
                onClick={() => setShowPackageModal(false)}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-500 hover:text-gray-700 z-10 bg-white rounded-full p-1 shadow-sm"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="p-4 sm:p-6 lg:p-8 overflow-y-auto flex-1">
                {/* Header */}
                <div className="text-center mb-4 sm:mb-6">
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold">
                    <span className="text-green-700">PLAY & FOOD</span>
                    <span className="text-gray-900"> Packages</span>
                  </h2>
                  <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2">
                    All-inclusive packages for groups up to 5 people
                  </p>
                </div>

                {/* Package Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {PLAY_FOOD_PACKAGES.map((pkg) => {
                    const isAvailable = pkg.duration <= maxDuration;
                    return (
                      <div 
                        key={pkg.id}
                        className={`bg-white rounded-lg border-2 p-3 sm:p-4 ${
                          pkg.isPopular ? 'border-green-500 relative' : 'border-gray-200'
                        } ${!isAvailable ? 'opacity-60' : ''}`}
                      >
                        {pkg.isPopular && (
                          <div className="absolute -top-2 sm:-top-3 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-2 sm:px-3 py-0.5 rounded-full text-xs font-semibold">
                            Most Popular
                          </div>
                        )}
                        
                        <div className="text-center mb-2 sm:mb-3">
                          <h3 className="text-base sm:text-lg font-bold text-green-800">{pkg.name}</h3>
                          <p className="text-xs sm:text-sm text-gray-600">{pkg.displayName}</p>
                        </div>

                        <div className="text-center mb-2 sm:mb-3">
                          <div className="text-lg sm:text-xl font-bold text-green-700">
                            ฿{pkg.price.toLocaleString()} <span className="text-xs font-normal text-gray-600">NET</span>
                          </div>
                          <div className="text-xs text-gray-500">
                            ฿{pkg.pricePerPerson} per person
                          </div>
                        </div>

                        <div className="text-xs text-gray-600 space-y-0.5 sm:space-y-1 mb-2 sm:mb-3">
                          <div className="font-semibold">Duration: {pkg.duration} hour{pkg.duration > 1 ? 's' : ''}</div>
                          <div className="font-semibold mt-1 sm:mt-2">Includes:</div>
                          <div className="text-[11px] sm:text-xs space-y-0.5">
                            <div>• Golf simulator ({pkg.duration}hr)</div>
                            {pkg.foodItems.slice(0, 2).map((food, idx) => (
                              <div key={idx}>• {food.name}</div>
                            ))}
                            {pkg.foodItems.length > 2 && (
                              <div>• +{pkg.foodItems.length - 2} more items</div>
                            )}
                            <div>• {pkg.drinks[0].type === 'unlimited' ? 'Unlimited drinks' : 'Drinks included'}</div>
                          </div>
                        </div>

                        <button
                          disabled={!isAvailable}
                          onClick={() => {
                            if (isAvailable) {
                              setLocalSelectedPackage(pkg);
                              setDuration(pkg.duration);
                              const newUrl = `/bookings?package=${pkg.id}`;
                              router.replace(newUrl, { scroll: false });
                              setShowPackageModal(false);
                            }
                          }}
                          className={`w-full py-1.5 sm:py-2 px-2 sm:px-3 rounded text-xs sm:text-sm font-semibold transition-colors ${
                            !isAvailable
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              : pkg.isPopular 
                              ? 'bg-green-600 hover:bg-green-700 text-white' 
                              : 'bg-green-500 hover:bg-green-600 text-white'
                          }`}
                        >
                          {!isAvailable ? 'Not Available' : `Select ${pkg.name}`}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Bay Only Option */}
                <div className="mt-4 border-t pt-4">
                  <button
                    onClick={() => {
                      setLocalSelectedPackage(null);
                      setDuration(1);
                      setNumberOfPeople(1);
                      router.replace('/bookings', { scroll: false });
                      setShowPackageModal(false);
                    }}
                    className="w-full py-2 px-3 rounded border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Continue without package (bay rental only - normal rates apply)
                  </button>
                </div>

                {/* Additional Info */}
                <div className="mt-4 sm:mt-6 bg-gray-50 rounded-lg p-3 sm:p-4 text-center">
                  <p className="text-xs sm:text-sm text-gray-600">
                    All packages are designed for groups of up to 5 people. 
                    You can enjoy these packages with fewer people too!
                  </p>
                  <Link 
                    href="/play-and-food"
                    className="inline-block mt-2 sm:mt-3 text-xs sm:text-sm text-green-600 hover:text-green-700 underline"
                  >
                    View full details and menu
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Golf Club Rental Details Modal */}
      {showClubRentalModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowClubRentalModal(false)} />
          <div className="fixed inset-0 flex items-end sm:items-center justify-center z-50 sm:p-4">
            <div className="bg-white rounded-t-xl sm:rounded-xl w-full sm:max-w-4xl max-h-[85vh] sm:max-h-[90vh] overflow-hidden relative flex flex-col">
              {/* Close button */}
              <button
                onClick={() => setShowClubRentalModal(false)}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-500 hover:text-gray-700 z-10 bg-white rounded-full p-1 shadow-sm"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="p-4 sm:p-6 lg:p-8 overflow-y-auto flex-1">
                {/* Header */}
                <div className="text-center mb-4 sm:mb-6">
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold">
                    <span className="text-green-700">Golf Club Rental</span>
                    <span className="text-gray-900"> Options</span>
                  </h2>
                  <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2">
                    Choose from standard or premium golf clubs for your session
                  </p>
                </div>

                {/* Pricing Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 text-center">Premium Club Pricing</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {GOLF_CLUB_PRICING.map((pricing) => (
                      <div 
                        key={pricing.duration}
                        className="bg-gray-50 rounded-lg p-3 text-center border"
                      >
                        <div className="text-sm font-semibold text-gray-900">{pricing.displayText}</div>
                        <div className="text-lg font-bold text-green-600 mt-1">฿{pricing.price}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Club Options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {/* Standard Clubs */}
                  <div className="bg-gray-50 rounded-lg border p-4 sm:p-6 opacity-75">
                    <h3 className="text-lg font-bold text-gray-600 mb-2">Standard Set</h3>
                    <p className="text-sm text-gray-500 mb-3">Quality rental clubs suitable for all skill levels</p>
                    
                    <div className="mb-4">
                      <p className="font-semibold text-gray-600 mb-2 text-sm">Includes:</p>
                      <ul className="space-y-1 text-sm text-gray-500">
                        <li className="flex items-start">
                          <CheckIcon className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                          <span>Full set of clubs</span>
                        </li>
                        <li className="flex items-start">
                          <CheckIcon className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                          <span>Golf bag included</span>
                        </li>
                        <li className="flex items-start">
                          <CheckIcon className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                          <span>Suitable for beginners to intermediate</span>
                        </li>
                      </ul>
                    </div>

                    <div className="text-center py-2 px-3 rounded bg-gray-200 text-gray-500 font-semibold text-sm">
                      Free with Booking
                    </div>
                  </div>

                  {/* Premium Clubs */}
                  <div className="bg-white rounded-lg border-2 border-green-500 p-4 sm:p-6 relative">
                    <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-3 py-0.5 rounded-full text-xs font-semibold">
                      Premium Choice
                    </div>
                    
                    <h3 className="text-lg font-bold text-green-800 mb-2">Premium Sets</h3>
                    <p className="text-sm text-gray-600 mb-3">Callaway & Majesty Professional Clubs</p>
                    
                    <div className="space-y-3 mb-4">
                      {/* Men's Set */}
                      <div className="border-l-4 border-green-500 pl-3">
                        <h4 className="font-semibold text-gray-800 text-sm">Men&apos;s Set - Callaway Warbird</h4>
                        <p className="text-xs text-gray-600 mb-1">Full set with Uniflex shafts</p>
                        <ul className="space-y-0.5 text-xs text-gray-600">
                          <li className="flex items-start">
                            <CheckIcon className="h-3 w-3 text-green-500 mr-1 mt-0.5 flex-shrink-0" />
                            <span>Driver, 5-wood, Irons 5-9, PW, SW</span>
                          </li>
                          <li className="flex items-start">
                            <CheckIcon className="h-3 w-3 text-green-500 mr-1 mt-0.5 flex-shrink-0" />
                            <span>Premium Callaway golf bag</span>
                          </li>
                        </ul>
                      </div>

                      {/* Women's Set */}
                      <div className="border-l-4 border-green-500 pl-3">
                        <h4 className="font-semibold text-gray-800 text-sm">Women&apos;s Set - Majesty Shuttle</h4>
                        <p className="text-xs text-gray-600 mb-1">Ladies flex with premium design</p>
                        <ul className="space-y-0.5 text-xs text-gray-600">
                          <li className="flex items-start">
                            <CheckIcon className="h-3 w-3 text-green-500 mr-1 mt-0.5 flex-shrink-0" />
                            <span>12.5° Driver, Irons 7-9, PW, 56° SW</span>
                          </li>
                          <li className="flex items-start">
                            <CheckIcon className="h-3 w-3 text-green-500 mr-1 mt-0.5 flex-shrink-0" />
                            <span>Premium ladies golf bag</span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <div className="text-center py-2 px-3 rounded bg-green-600 text-white font-semibold text-sm">
                      Starting from ฿150
                    </div>
                  </div>
                </div>

                {/* Additional Info */}
                <div className="mt-6 bg-green-50 rounded-lg p-4 text-center">
                  <h4 className="font-semibold text-gray-900 mb-2 text-sm">Can I use the clubs outside LENGOLF?</h4>
                  <p className="text-xs sm:text-sm text-gray-700">
                    Yes! You can take our rental clubs to play at any golf course in Bangkok or Thailand. 
                    Perfect for tourists or locals who want to play without owning clubs.
                  </p>
                </div>

                {/* Close Button */}
                <div className="mt-6 text-center">
                  <button
                    onClick={() => setShowClubRentalModal(false)}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg font-medium transition-colors text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      
      {/* Bay Information Modal */}
      <BayInfoModal 
        isOpen={showBayInfoModal} 
        onClose={() => setShowBayInfoModal(false)} 
      />
    </div>
  );
}