'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useFormatter, useLocale } from 'next-intl';
import Image from 'next/image';
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
import { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import { useSession } from 'next-auth/react';
import type { Session } from 'next-auth';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import type { PlayFoodPackage } from '@/types/play-food-packages';
import { getPlayFoodPackages } from '@/types/play-food-packages';
import { getPremiumClubPricing, getPremiumPlusClubPricing, formatClubRentalInfo, getIndoorPrice, getSetThumbnailUrl, getGearUpItems } from '@/types/golf-club-rental';
import { usePricingLoader } from '@/lib/pricing-hook';
import type { RentalClubSetWithAvailability } from '@/types/golf-club-rental';
import { BayType } from '@/lib/bayConfig';
import { BayInfoModal } from '../../BayInfoModal';
import type { TimeSlot } from '../../../hooks/useAvailability';
import { calculateCost, type ApplicablePromotion, type CostBreakdown } from '@/lib/cost-calculator';
import { ProjectedCostBreakdown } from '@/components/booking/ProjectedCostBreakdown';
import { BookingSummaryBar, BOOKING_SUMMARY_BAR_SPACER } from '@/components/shared/BookingSummaryBar';
import { NoAvailabilityModal } from './details/modals/NoAvailabilityModal';
import { SubmitOverlay } from './details/modals/SubmitOverlay';
import { PackageDetailsModal } from './details/modals/PackageDetailsModal';
import { ClubRentalDetailsModal } from './details/modals/ClubRentalDetailsModal';

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
  selectedClubSetId?: string | null;
  onClubSetIdChange?: (id: string | null) => void;
  selectedAddOns?: Record<string, boolean>;
  onAddOnsChange?: (addOns: Record<string, boolean>) => void;
}

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
  selectedClubSetId,
  onClubSetIdChange,
  selectedAddOns = {},
  onAddOnsChange,
}: BookingDetailsProps) {
  const t = useTranslations('bookings.detailsStep');
  const tErrors = useTranslations('bookings.errors');
  const formatter = useFormatter();
  const locale = useLocale();
  // ProjectedCostBreakdown supports all 5 main-site locales.
  const costLanguage: 'en' | 'th' | 'ja' | 'ko' | 'zh' =
    (locale === 'th' || locale === 'ja' || locale === 'ko' || locale === 'zh') ? locale : 'en';
  const router = useRouter();
  const { data: session, status } = useSession() as { data: ExtendedSession | null, status: 'loading' | 'authenticated' | 'unauthenticated' };
  usePricingLoader();
  const PLAY_FOOD_PACKAGES = getPlayFoodPackages();
  const PREMIUM_CLUB_PRICING = getPremiumClubPricing();
  const PREMIUM_PLUS_CLUB_PRICING = getPremiumPlusClubPricing();
  const [duration, setDuration] = useState<number>(1);
  const [selectedBay, setSelectedBay] = useState<BayType | null>(selectedBayType || 'social');
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
  const [marketingOptIn, setMarketingOptIn] = useState<boolean>(false);
  const [vipDataPrepopulated, setVipDataPrepopulated] = useState(false);

  // Club rental availability state
  const [availableClubSets, setAvailableClubSets] = useState<RentalClubSetWithAvailability[]>([]);
  const [clubSetsLoading, setClubSetsLoading] = useState(false);
  const [errors, setErrors] = useState({
    duration: '',
    phoneNumber: '',
    email: '',
    name: '',
  });
  // Which required field the sticky CTA flagged as incomplete. Drives the
  // scroll + highlight. Mirrors the course-rental pattern.
  const [errorField, setErrorField] = useState<string | null>(null);
  const [showNoAvailabilityModal, setShowNoAvailabilityModal] = useState(false);
  const [showBayInfoModal, setShowBayInfoModal] = useState(false);
  const loadingSteps = [
    t('loadingStepCheckingAvailability'),
    t('loadingStepCreatingBooking'),
    t('loadingStepSendingNotifications'),
    t('loadingStepBookingConfirmed'),
  ];

  // Cost estimation state
  const [hasActivePackage, setHasActivePackage] = useState(false);
  const [packageDisplayName, setPackageDisplayName] = useState<string>();
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [applicablePromotions, setApplicablePromotions] = useState<ApplicablePromotion[]>([]);
  const [costDataLoading, setCostDataLoading] = useState(true);

  // Fetch package + new-customer status for cost estimation
  useEffect(() => {
    if (status !== 'authenticated') {
      setCostDataLoading(false);
      return;
    }

    let cancelled = false;
    async function fetchCostData() {
      try {
        // Eligibility (isNewCustomer) is computed phone-aware in the effect
        // watching `phoneNumber`; we deliberately do NOT call the legacy
        // profile-only /api/user/has-bookings here because it can race the
        // phone-aware fetch (slower of the two wins) and re-introduce the
        // bait-and-switch bug.
        const [pkgRes, promoRes] = await Promise.all([
          fetch('/api/user/active-packages'),
          fetch('/api/promotions/applicable'),
        ]);
        if (cancelled) return;

        const pkgData = await pkgRes.json();
        const promoData = await promoRes.json();

        setHasActivePackage(pkgData.hasPackage ?? false);
        setPackageDisplayName(pkgData.packageDisplayName);
        setApplicablePromotions(promoData.promotions ?? []);
      } catch (err) {
        console.error('[CostEstimate] Failed to fetch cost data:', err);
      } finally {
        if (!cancelled) setCostDataLoading(false);
      }
    }
    fetchCostData();
    return () => { cancelled = true; };
  }, [status]);

  // Re-evaluate new-customer status whenever the phone field changes.
  // Uses the canonical public.is_phone_new_customer predicate via
  // /api/user/has-bookings?phone=… so that an existing customer logging in
  // through a fresh auth profile (or guest flow) is correctly identified
  // before they confirm — preventing B1G1 from being shown to returning
  // customers in the cost preview.
  //
  // Uses a `cancelled` flag rather than AbortController because aborting
  // the fetch doesn't stop a response that has already arrived from
  // resolving its .then chain — meaning a slower in-flight call could
  // overwrite a faster newer one. The flag guarantees only the latest
  // invocation can call setState.
  useEffect(() => {
    const phone = phoneNumber?.trim();
    if (!phone || phone.length < 8) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/user/has-bookings?phone=${encodeURIComponent(phone)}`)
        .then(res => res.json())
        .then(hbData => {
          if (cancelled) return;
          setIsNewCustomer(hbData.hasBookings === false);
        })
        .catch((err) => {
          if (cancelled) return;
          console.warn('[has-bookings] phone-aware fetch failed:', err);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phoneNumber]);

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
          toast(t('durationSwitchedToAi'), {
            icon: 'ℹ️',
            duration: 4000,
          });
        } else if (selectedBay === 'ai_lab' && availability.ai === 0 && availability.social > 0) {
          setSelectedBay('social');
          toast(t('durationSwitchedToSocial'), {
            icon: 'ℹ️',
            duration: 4000,
          });
        }
      }
    }
  }, [duration, selectedBay, selectedBayType, slotData, getBayAvailabilityForDuration, t]);

  // Local state for package selector to allow switching
  const [localSelectedPackage, setLocalSelectedPackage] = useState<PlayFoodPackage | null>(selectedPackage || null);

  // Compute cost breakdown reactively (must be after localSelectedPackage declaration)
  const costBreakdown: CostBreakdown | null = (() => {
    if (!selectedDate || !selectedTime) return null;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return calculateCost({
      date: dateStr,
      startTime: selectedTime,
      duration,
      clubRentalId: selectedClubRental,
      addOns: selectedAddOns,
      playFoodPackageId: localSelectedPackage?.id ?? null,
      hasActivePackage,
      packageDisplayName,
      isNewCustomer,
      applicablePromotions,
    });
  })();

  const [showPackageModal, setShowPackageModal] = useState(false);
  const [showClubRentalModal, setShowClubRentalModal] = useState(false);

  // Update local state when selectedPackage changes
  useEffect(() => {
    setLocalSelectedPackage(selectedPackage || null);
  }, [selectedPackage]);

  // Fetch club set availability when date/time are known
  useEffect(() => {
    const fetchClubAvailability = async () => {
      if (!selectedDate || !selectedTime) return;
      setClubSetsLoading(true);
      try {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const params = new URLSearchParams({
          type: 'indoor',
          date: dateStr,
          start_time: selectedTime,
          duration: String(duration),
        });
        const res = await fetch(`/api/clubs/availability?${params}`);
        if (res.ok) {
          const data = await res.json();
          setAvailableClubSets(data.sets || []);
        }
      } catch (err) {
        console.error('[BookingDetails] Failed to fetch club availability:', err);
      } finally {
        setClubSetsLoading(false);
      }
    };
    fetchClubAvailability();
  }, [selectedDate, selectedTime, duration]);

  const validateForm = () => {
    const currentErrors = { duration: '', phoneNumber: '', email: '', name: '' };
    let isValid = true;

    if (!name) {
      currentErrors.name = tErrors('nameRequired');
      isValid = false;
    }
    if (!email) {
      currentErrors.email = tErrors('emailRequired');
      isValid = false;
    }
    // Updated phone number validation
    if (!phoneNumber) {
      currentErrors.phoneNumber = tErrors('phoneRequired');
      isValid = false;
    } else if (!isValidPhoneNumber(phoneNumber)) {
      currentErrors.phoneNumber = tErrors('phoneInvalid');
      isValid = false;
    }

    // Validate bay type selection when coming from "All Bays"
    if (!selectedBayType && !selectedBay) {
      toast.error(tErrors('selectBayType'));
      isValid = false;
    }

    setErrors(currentErrors);

    if (!isValid && (currentErrors.name || currentErrors.email || currentErrors.phoneNumber)) {
      // Consolidate toast messages or show one generic message
      toast.error(tErrors('fillAllRequired'));
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

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!supabase) {
      toast.error(tErrors('bookingSystemNotReady'));
      return;
    }

    if (!validateForm()) {
      return;
    }

    if (!session) {
      toast.error(tErrors('signInToContinue'));
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
        throw new Error(tErrors('userNotAuthenticated'));
      }
      
      // Build customer_notes with system-generated lines (club rental, add-ons)
      // PREPENDED so a long user note can never push them past column limits or
      // out of view in the LINE staff notification. User text always lands last.
      const gearUpItems = getGearUpItems();
      const addOnsPayload = gearUpItems
        .filter((g) => g.id !== 'delivery' && selectedAddOns[g.id])
        .map((g) => ({ key: g.id, label: g.name, price: g.price }));

      const systemLines: string[] = [];
      const clubRentalInfo = formatClubRentalInfo(selectedClubRental);
      if (clubRentalInfo) systemLines.push(clubRentalInfo);
      if (addOnsPayload.length > 0) {
        systemLines.push(`Add-ons: ${addOnsPayload.map((a) => `${a.label} (฿${a.price})`).join(', ')}`);
      }
      const finalCustomerNotes = systemLines.length > 0
        ? (customerNotes ? `${systemLines.join('\n')}\n${customerNotes}` : systemLines.join('\n'))
        : customerNotes;
      
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

      // Pre-validate club rental availability before creating booking
      if (selectedClubSetId && selectedClubRental && selectedClubRental !== 'none' && selectedClubRental !== 'standard') {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const availParams = new URLSearchParams({
          type: 'indoor',
          date: dateStr,
          start_time: selectedTime!,
          duration: String(duration),
        });
        const availRes = await fetch(`/api/clubs/availability?${availParams}`);
        if (availRes.ok) {
          const availData = await availRes.json();
          const selectedSet = (availData.sets || []).find((s: { id: string }) => s.id === selectedClubSetId);
          if (!selectedSet || selectedSet.available_count <= 0) {
            toast.error(tErrors('clubSetUnavailable'));
            onClubRentalChange?.('standard');
            onClubSetIdChange?.(null);
            setIsSubmitting(false);
            setShowLoadingOverlay(false);
            return;
          }
        } else {
          console.warn('[BookingDetails] Club availability pre-check failed, proceeding with server-side validation:', availRes.status);
        }
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
          preferred_bay_type: selectedBayType || selectedBay,
          club_set_id: selectedClubSetId || null,
          club_rental_type: selectedClubRental,
          add_ons: addOnsPayload.length > 0 ? addOnsPayload : null,
          language: locale,
          marketing_opt_in: marketingOptIn,
        })
      });
      
      if (!createResponse.ok) {
        let errorMessage = tErrors('createBookingFailed');
        try {
          const errorData = await createResponse.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = tErrors('apiError', { status: createResponse.status, statusText: createResponse.statusText });
        }
        throw new Error(errorMessage);
      }

      const createData = await createResponse.json();

      // Check if booking data exists in the response
      if (!createData || !createData.booking) {
        throw new Error(tErrors('invalidBookingResponse'));
      }

      const { booking, notificationsSuccess } = createData;


      // If notifications failed, show a warning but continue
      if (notificationsSuccess === false) {
        toast.error(tErrors('notificationsFailed'));
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
      toast.error(error instanceof Error ? error.message : tErrors('genericBookingError'));
      setIsSubmitting(false);
      setShowLoadingOverlay(false);
    }
  };

  const formatDate = (date: Date) => {
    return formatter.dateTime(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
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

  // Returns the id of the first incomplete required field, or null if valid.
  // Order matters: it is the order the customer reads the form in.
  const firstInvalidField = (): string | null => {
    if (!name.trim()) return 'bd-name';
    if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) return 'bd-phone';
    if (!email.trim()) return 'bd-email';
    if (!selectedBayType && !selectedBay) return 'bd-bay';
    return null;
  };

  // Sticky-bar primary action: validate, then submit or scroll to + focus the
  // first incomplete field. Never a silently disabled button.
  const handlePrimaryCta = () => {
    const bad = firstInvalidField();
    if (bad) {
      setErrorField(bad);
      const el = document.getElementById(bad);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = el.querySelector('input, textarea, select') as HTMLElement | null;
        window.setTimeout(() => input?.focus({ preventScroll: true }), 350);
      }
      return;
    }
    setErrorField(null);
    void handleSubmit();
  };

  return (
    <div className={`space-y-4 sm:space-y-6 ${BOOKING_SUMMARY_BAR_SPACER}`}>
      {/* Selected Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6 border border-green-100">
          <div className="flex items-center gap-3">
            <div className="bg-green-50 p-2 sm:p-3 rounded-full">
              <CalendarIcon className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">{t('selectedDate')}</h3>
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
              <h3 className="text-sm font-medium text-gray-600">{t('startTime')}</h3>
              <p className="text-lg sm:text-xl font-bold text-green-700">
                {selectedTime}
              </p>
            </div>
          </div>
        </div>

        <div id="bd-bay" className="bg-white rounded-xl shadow-sm p-3 sm:p-6 border border-green-100 scroll-mt-24">
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
                {t('bayType')} <span className="text-red-500">*</span>
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
                      {t('social')} {currentAvailability.social === 0 && t('naSuffix')}
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
                      {t('aiLab')} {currentAvailability.ai === 0 && t('naSuffix')}
                    </button>
                  </div>
                  <button
                    onClick={() => setShowBayInfoModal(true)}
                    className="text-xs text-gray-500 hover:text-gray-700 underline transition-colors"
                  >
                    {t('whatsTheDifference')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className={`text-lg sm:text-xl font-bold ${
                    selectedBayType === 'ai_lab' ? 'text-purple-700' : 'text-green-700'
                  }`}>
                    {selectedBayType === 'ai_lab' ? t('aiLab') : t('socialBay')}
                  </p>
                  <button
                    onClick={() => setShowBayInfoModal(true)}
                    className="text-xs text-gray-500 hover:text-gray-700 underline transition-colors"
                  >
                    {t('info')}
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
                {t('aiLabRecommendationTitle')}
              </h4>
              <p className="text-sm text-yellow-700">
                {t('aiLabRecommendationBody')}
              </p>
              <button
                onClick={onBack}
                className="mt-2 text-sm text-yellow-600 hover:text-yellow-500 underline"
              >
                {t('aiLabBackToSocial')}
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
              {t('playFoodPackageLabel')}
            </label>
            <button
              type="button"
              onClick={() => setShowPackageModal(true)}
              className="text-xs text-green-600 hover:text-green-700 underline"
            >
              {t('viewDetails')}
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
              <span className="font-semibold text-[11px] sm:text-xs">{t('bayOnly')}</span>
              <span className="text-[9px] sm:text-[10px] mt-0.5 opacity-75">{t('bayOnlyDescription')}</span>
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
                {t('selectedPackageInline', {
                  name: localSelectedPackage.name,
                  duration: localSelectedPackage.duration,
                  price: localSelectedPackage.price.toLocaleString(),
                })}
              </div>
              <div className="text-xs text-gray-600">
                <span className="font-medium">{t('packageIncludes')}</span> Golf simulator, {localSelectedPackage.foodItems.map(f => f.name).join(', ')}, {localSelectedPackage.drinks.map(d => d.type === 'unlimited' ? `Unlimited ${d.name}` : d.type === 'per_person' ? `${d.quantity}x ${d.name} per person` : `${d.quantity}x ${d.name}`).join(', ')}
              </div>
            </div>
          ) : (
            <div className="mt-3 text-xs text-gray-500 text-center">
              {t('bayOnlyHelper')}
            </div>
          )}
        </div>


        {/* Duration Selection - Only for regular bookings */}
        {!localSelectedPackage && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('durationLabel')}
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
                    <span className="font-medium text-blue-900">{t('availableForDuration', { duration })}</span>
                    {currentAvailability.social > 0 && currentAvailability.ai > 0 && (
                      <span className="text-blue-700">
                        {t('availableSocialOrAi', { social: currentAvailability.social, ai: currentAvailability.ai })}
                      </span>
                    )}
                    {currentAvailability.social > 0 && currentAvailability.ai === 0 && (
                      <span className="text-blue-700">
                        {t('availableSocialOnly', { social: currentAvailability.social })}
                      </span>
                    )}
                    {currentAvailability.social === 0 && currentAvailability.ai > 0 && (
                      <span className="text-blue-700">
                        {t('availableAiOnly')}
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
            {t('numberOfPeople')}
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
              {t('clubRentalLabel')}
            </label>
            <button
              type="button"
              onClick={() => setShowClubRentalModal(true)}
              className="text-xs text-green-600 hover:text-green-700 underline"
            >
              {t('viewDetails')}
            </button>
          </div>

          {/* No Rental / Standard row */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              type="button"
              onClick={() => { onClubRentalChange?.('none'); onClubSetIdChange?.(null); }}
              className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
                selectedClubRental === 'none'
                  ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                  : 'border-gray-300 text-gray-700 hover:border-green-600'
              }`}
            >
              <span className="font-semibold text-[11px] sm:text-xs">{t('noRental')}</span>
              <span className="text-[9px] sm:text-[10px] mt-0.5 opacity-75">{t('noRentalDescription')}</span>
            </button>

            <button
              type="button"
              onClick={() => { onClubRentalChange?.('standard'); onClubSetIdChange?.(null); }}
              className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
                selectedClubRental === 'standard'
                  ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                  : 'border-gray-300 text-gray-700 hover:border-green-600'
              }`}
            >
              <span className="font-semibold text-[11px] sm:text-xs">{t('standardSet')}</span>
              <span className="text-[9px] sm:text-[10px] mt-0.5 opacity-75 text-gray-500">{t('standardSetFree')}</span>
            </button>
          </div>

          {/* Premium club sets from DB with real availability */}
          {clubSetsLoading ? (
            <div className="text-xs text-gray-400 text-center py-3">{t('checkingClubAvailability')}</div>
          ) : availableClubSets.length > 0 ? (
            <div className="space-y-2">
              {availableClubSets.map((clubSet) => {
                const isSelected = selectedClubSetId === clubSet.id;
                const isAvailable = clubSet.available_count > 0;
                const price = getIndoorPrice(clubSet, duration);
                const isPremiumPlus = clubSet.tier === 'premium-plus';
                const thumbUrl = getSetThumbnailUrl(clubSet);

                return (
                  <button
                    key={clubSet.id}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => {
                      if (!isAvailable) return;
                      onClubRentalChange?.(clubSet.tier);
                      onClubSetIdChange?.(clubSet.id);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      !isAvailable
                        ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                        : isSelected && isPremiumPlus
                          ? 'border-[#c8a96e] text-white'
                          : isSelected
                            ? 'border-green-600 bg-green-50'
                            : 'border-gray-300 hover:border-green-600'
                    }`}
                    style={isSelected && isPremiumPlus ? { backgroundColor: '#003d1f' } : undefined}
                  >
                    {thumbUrl && (
                      <div className={`relative w-14 h-14 rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center border ${
                        isSelected && isPremiumPlus ? 'bg-white border-white/30' : 'bg-white border-gray-200'
                      }`}>
                        <Image
                          src={thumbUrl}
                          alt={`${clubSet.brand ?? ''} ${clubSet.model ?? ''}`.trim() || 'Club set'}
                          fill
                          className="object-contain p-0.5"
                          sizes="56px"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold text-xs ${
                          isSelected && isPremiumPlus ? 'text-white' :
                          isSelected ? 'text-green-700' :
                          isPremiumPlus ? 'text-[#003d1f]' : 'text-gray-900'
                        }`}>
                          {isPremiumPlus ? t('premiumPlusLabel') : t('premiumLabel')} — {clubSet.gender === 'mens' ? t('clubSetMens') : t('clubSetWomens')}
                        </span>
                        {!isAvailable && (
                          <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">{t('clubSetUnavailable')}</span>
                        )}
                      </div>
                      <div className={`text-[11px] mt-0.5 ${
                        isSelected && isPremiumPlus ? 'text-white/70' :
                        isSelected ? 'text-green-600/70' : 'text-gray-500'
                      }`}>
                        {clubSet.brand} {clubSet.model}
                      </div>
                    </div>
                    <div className={`text-right flex-shrink-0 ml-auto ${
                      isSelected && isPremiumPlus ? 'text-white' :
                      isSelected ? 'text-green-700' : 'text-gray-900'
                    }`}>
                      <div className="font-bold text-sm">฿{price.toLocaleString()}</div>
                      <div className={`text-[10px] ${
                        isSelected && isPremiumPlus ? 'text-white/60' : 'text-gray-400'
                      }`}>{t('clubSetDurationSuffix', { hours: duration })}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Fallback to static buttons if DB fetch fails */
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { onClubRentalChange?.('premium'); onClubSetIdChange?.(null); }}
                className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
                  selectedClubRental === 'premium'
                    ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                    : 'border-gray-300 text-gray-700 hover:border-green-600'
                }`}
              >
                <span className="font-semibold text-[11px] sm:text-xs text-green-600 font-bold">{t('premiumLabel')}</span>
                <span className="text-[10px] sm:text-xs mt-0.5 opacity-75">{t('premiumStartingFromShort')}</span>
              </button>

              <button
                type="button"
                onClick={() => { onClubRentalChange?.('premium-plus'); onClubSetIdChange?.(null); }}
                className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs transition-colors ${
                  selectedClubRental === 'premium-plus'
                    ? 'border-[#c8a96e] text-white font-medium'
                    : 'border-gray-300 text-gray-700 hover:border-[#c8a96e]'
                }`}
                style={selectedClubRental === 'premium-plus' ? { backgroundColor: '#003d1f' } : undefined}
              >
                <span className="font-bold text-[11px] sm:text-xs" style={{ color: selectedClubRental === 'premium-plus' ? '#ffffff' : '#003d1f' }}>
                  {t('premiumPlusLabel')}
                </span>
                <span className={`text-[10px] sm:text-xs mt-0.5 ${selectedClubRental === 'premium-plus' ? 'text-white/80' : 'opacity-75'}`}>{t('premiumPlusStartingFromShort')}</span>
              </button>
            </div>
          )}

        </div>

        {/* Gear Up — optional add-on items sold at booking time (e.g. glove). */}
        {(() => {
          const gearUpItems = getGearUpItems().filter((g) => g.id === 'gloves');
          if (gearUpItems.length === 0) return null;
          return (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                {t('gearUpLabel')}
              </label>
              <div className="grid grid-cols-1 gap-2">
                {gearUpItems.map((item) => {
                  const isSelected = !!selectedAddOns[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onAddOnsChange?.({ ...selectedAddOns, [item.id]: !isSelected })}
                      className={`group flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                        isSelected
                          ? 'border-green-600 bg-green-50 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-green-300'
                      }`}
                    >
                      <div className={`relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0 border ${
                        isSelected ? 'bg-white border-green-200' : 'bg-gray-50 border-gray-200'
                      }`}>
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          sizes="64px"
                          className="object-contain p-1"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 leading-tight">{item.name}</p>
                        {item.description && (
                          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{item.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className="text-sm font-bold text-green-700">฿{formatter.number(item.price)}</p>
                        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-green-600 border-green-600' : 'border-gray-300 bg-white'
                        }`}>
                          {isSelected && <CheckIcon className="h-4 w-4 text-white stroke-[3]" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Contact Information Section */}
        <div className="pt-4 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('contactInformation')}</h3>
          
          <div className="space-y-4">
            {/* Name field */}
            <div id="bd-name" className="scroll-mt-24">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('name')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errorField === 'bd-name') setErrorField(null);
                }}
                className={`w-full h-12 px-4 rounded-lg focus:outline-none ${
                  errorField === 'bd-name'
                    ? 'border-amber-500 bg-amber-50'
                    : `bg-gray-50 ${!name ? 'border-red-100' : 'border-green-500'}`
                } border focus:border-green-500 focus:ring-1 focus:ring-green-500`}
                placeholder={t('namePlaceholder')}
              />
              {errorField === 'bd-name' && (
                <p className="mt-1 text-sm font-medium text-amber-600">{t('errorNeedName')}</p>
              )}
            </div>

            {/* Phone Number */}
            <div id="bd-phone" className="scroll-mt-24">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('phoneNumber')}
              </label>
              <div className="relative">
                <PhoneInput
                  international
                  defaultCountry="TH"
                  placeholder={t('phoneNumberPlaceholder')}
                  value={phoneNumber}
                  onChange={(value) => {
                    setPhoneNumber(value);
                    if (errorField === 'bd-phone') setErrorField(null);
                  }}
                  className={`w-full h-12 px-3 py-2 rounded-lg focus:outline-none border focus:border-green-500 focus:ring-1 focus:ring-green-500 custom-phone-input ${
                    errorField === 'bd-phone'
                      ? 'border-amber-500 bg-amber-50'
                      : `bg-gray-50 ${
                          errors.phoneNumber
                            ? 'border-red-500'
                            : (phoneNumber && isValidPhoneNumber(phoneNumber || ''))
                            ? 'border-green-500'
                            : 'border-gray-200'
                        }`
                  }`}
                />
              </div>
              {/* Helper text to guide country selection if number is empty */}
              {!phoneNumber && (
                <p className="mt-1 text-xs text-gray-500">
                  {t('phoneCountryHelper')}
                </p>
              )}
              {errorField === 'bd-phone' && (
                <p className="mt-1 text-sm font-medium text-amber-600">{t('errorNeedPhone')}</p>
              )}
              {errors.phoneNumber && (
                <p className="mt-1 text-sm text-red-600">{errors.phoneNumber}</p>
              )}
            </div>

            {/* Email */}
            <div id="bd-email" className="scroll-mt-24">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('emailAddress')}
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorField === 'bd-email') setErrorField(null);
                  }}
                  className={`w-full h-12 px-4 rounded-lg focus:outline-none ${
                    errorField === 'bd-email'
                      ? 'border border-amber-500 bg-amber-50 focus:border-green-500 focus:ring-1 focus:ring-green-500'
                      : !email
                      ? 'bg-gray-50 border border-red-100 focus:border-green-500 focus:ring-1 focus:ring-green-500'
                      : 'bg-gray-50 border border-green-500'
                  }`}
                  placeholder={isLineUser ? t('emailPlaceholderLine') : t('emailPlaceholderDefault')}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {t('emailConfirmationNote')}
              </p>
              {errorField === 'bd-email' && (
                <p className="mt-1 text-sm font-medium text-amber-600">{t('errorNeedEmail')}</p>
              )}
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email}</p>
              )}
            </div>
          </div>
        </div>

        {/* Add Customer Notes/Special Requests field */}
        <div>
          <label htmlFor="customerNotes" className="block text-sm font-medium text-gray-700 mb-1">
            {t('notesLabel')}
          </label>
          <textarea
            id="customerNotes"
            value={customerNotes}
            onChange={(e) => setCustomerNotes(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none text-sm sm:text-base"
            placeholder={t('notesPlaceholder')}
          />
          <p className="mt-1 text-xs sm:text-sm text-gray-500">
            {t('notesHelper')}
          </p>
        </div>

        {/* Projected Cost Breakdown */}
        {costBreakdown && (
          <div className="mt-4">
            <ProjectedCostBreakdown
              breakdown={costBreakdown}
              isLoading={costDataLoading}
              language={costLanguage}
            />
          </div>
        )}

        {/* Back only. The primary action lives in the sticky bar so it is
            always reachable without scrolling past the whole form. */}
        <div className="flex justify-start mt-6">
          <button
            type="button"
            onClick={onBack}
            className="py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            disabled={isSubmitting}
          >
            {t('back')}
          </button>
        </div>

        {/* Marketing opt-in: only meaningful once an email is entered. */}
        {email.trim().length > 0 && (
          <label
            htmlFor="booking-marketing-opt-in"
            className="mt-4 flex items-start gap-3 p-3 rounded-md cursor-pointer"
            style={{
              backgroundColor: 'rgba(0, 90, 50, 0.08)',
              border: '1px solid rgba(0, 90, 50, 0.4)',
            }}
          >
            <input
              id="booking-marketing-opt-in"
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[#005a32]"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
              disabled={isSubmitting}
            />
            <span className="text-sm text-gray-800">
              <span className="font-medium block">{t('marketingOptInLabel')}</span>
              <span className="text-gray-600">{t('marketingOptInDescription')}</span>
            </span>
          </label>
        )}

        <p className="text-xs text-gray-400 text-center mt-3">
          {t('consentNote')}
        </p>
      </form>

      <BookingSummaryBar
        total={costBreakdown ? costBreakdown.estimatedTotal : null}
        totalLabel={t('summaryTotalLabel')}
        subline={`${duration} hr · ${selectedTime}`}
        ctaLabel={isSubmitting ? t('processing') : t('confirmBooking')}
        onCta={handlePrimaryCta}
        ctaLoading={isSubmitting}
        emptyPrompt={t('summaryEmptyPrompt')}
      />

      {/* No Availability Modal */}
      <NoAvailabilityModal
        isOpen={showNoAvailabilityModal}
        onClose={() => setShowNoAvailabilityModal(false)}
        onBack={onBack}
      />

      {/* Add the loading overlay */}
      <SubmitOverlay
        isOpen={showLoadingOverlay}
        steps={loadingSteps}
        currentStep={loadingStep}
      />

      {/* Package Details Modal */}
      <PackageDetailsModal
        isOpen={showPackageModal}
        onClose={() => setShowPackageModal(false)}
        packages={PLAY_FOOD_PACKAGES}
        maxDuration={maxDuration}
        onSelectPackage={(pkg) => {
          setLocalSelectedPackage(pkg);
          setDuration(pkg.duration);
          const newUrl = `/bookings?package=${pkg.id}`;
          router.replace(newUrl, { scroll: false });
          setShowPackageModal(false);
        }}
        onContinueWithoutPackage={() => {
          setLocalSelectedPackage(null);
          setDuration(1);
          setNumberOfPeople(1);
          router.replace('/bookings', { scroll: false });
          setShowPackageModal(false);
        }}
      />

      {/* Golf Club Rental Details Modal */}
      <ClubRentalDetailsModal
        isOpen={showClubRentalModal}
        onClose={() => setShowClubRentalModal(false)}
        premiumPricing={PREMIUM_CLUB_PRICING}
        premiumPlusPricing={PREMIUM_PLUS_CLUB_PRICING}
      />
      
      {/* Bay Information Modal */}
      <BayInfoModal 
        isOpen={showBayInfoModal} 
        onClose={() => setShowBayInfoModal(false)} 
      />
    </div>
  );
}