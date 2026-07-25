'use client';

import { useState, useEffect, useCallback } from 'react';
// Type-only namespace import: `handleSubmit` keeps its original
// `React.FormEvent` annotation and this file has no JSX.
import type * as React from 'react';
import { useTranslations, useFormatter, useLocale } from 'next-intl';
import { format } from 'date-fns';
import { createClient } from '@/utils/supabase/client';
import type { Database } from '@/types/supabase';
import { useRouter } from 'next/navigation';
import { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import { useSession } from 'next-auth/react';
import type { Session } from 'next-auth';
import { isValidPhoneNumber } from 'react-phone-number-input';
import type { PlayFoodPackage } from '@/types/play-food-packages';
import { getPlayFoodPackages } from '@/types/play-food-packages';
import { getPremiumClubPricing, getPremiumPlusClubPricing, formatClubRentalInfo, getGearUpItems } from '@/types/golf-club-rental';
import { usePricingLoader } from '@/lib/pricing-hook';
import { readAttribution } from '@/lib/attribution/click-ids';
import type { RentalClubSetWithAvailability } from '@/types/golf-club-rental';
import { BayType } from '@/lib/bayConfig';
import type { TimeSlot } from '../../../../hooks/useAvailability';
import { calculateCost, type ApplicablePromotion, type CostBreakdown } from '@/lib/cost-calculator';
import { computePackageCoverage, type PackageCoverage } from '@/lib/package-coverage';
import { allowedDurations } from '@/lib/booking-durations';
import type { DetailSubStep, DetailsSubStepNav } from './useDetailsSubStep';
import { firstIncompleteContactField } from './IdentityCard';
import { shouldWriteProfile } from './profileWriteBack';

/**
 * The balance half of `/api/user/active-packages`. Disclosure only — these
 * never reach `calculateCost`, which still keys coverage off the
 * `hasActivePackage` boolean alone.
 */
interface PackageBalance {
  remainingHours: number | null;
  totalHours: number | null;
  usedHours: number | null;
  expiryDate: string | null;
  isUnlimited: boolean;
}

const NO_PACKAGE_BALANCE: PackageBalance = {
  remainingHours: null,
  totalHours: null,
  usedHours: null,
  expiryDate: null,
  isUnlimited: false,
};

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

export interface BookingDetailsProps {
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
  /** Mobile sub-step navigation, owned by `useBookingFlow` so the header arrow
      can step back through it before leaving step 3. */
  subStepNav: DetailsSubStepNav;
}

/**
 * Which sub-step each `bd-*` anchor lives on. Used to navigate to the offending
 * sub-step before scrolling — an element hidden by `display: none` is still
 * found by `getElementById` but cannot be scrolled to, so flagging a field on
 * another sub-step would otherwise fail silently.
 */
const SUB_STEP_FOR_FIELD: Record<string, DetailSubStep> = {
  'bd-bay': 'session',
  'bd-name': 'contact',
  'bd-phone': 'contact',
  'bd-email': 'contact',
};

export function useBookingDetailsForm({
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
  subStepNav,
}: BookingDetailsProps) {
  const { subStep, goToSubStep, nextSubStep, isLast } = subStepNav;
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
  // Contact editing. A returning customer sees a read-only `IdentityCard`
  // instead of the three inputs; Change flips `isEditingContact` and reveals
  // them. `alsoUpdateAccount` is the opt-in that lets the edit reach the saved
  // `profiles` row — unchecked by default, so an edit is scoped to this booking
  // (owner-confirmed 2026-07-25; before this it always wrote back silently).
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [alsoUpdateAccount, setAlsoUpdateAccount] = useState(false);

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
  /**
   * Balance/expiry for the SAME package `hasActivePackage` refers to — see
   * `getActivePackageDetailsForCustomer`. Disclosure only: the cost calculator
   * never sees these, so they cannot move the charged total.
   */
  const [packageBalance, setPackageBalance] = useState<PackageBalance>(NO_PACKAGE_BALANCE);
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
        setPackageBalance({
          // `?? null` rather than `?? 0`: an absent balance must stay unknown,
          // because 0 would fire an overage warning for a package that has
          // hours. `computePackageCoverage` renders nothing on null.
          remainingHours: pkgData.remainingHours ?? null,
          totalHours: pkgData.totalHours ?? null,
          usedHours: pkgData.usedHours ?? null,
          expiryDate: pkgData.expiryDate ?? null,
          isUnlimited: pkgData.isUnlimited ?? false,
        });
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

  // Keep the selected duration on the allowed ladder. If the ladder no longer
  // contains it — the customer stepped back and picked a slot with less
  // headroom — fall back to the longest rung that still fits, so the form can
  // never hold a duration the server will reject. `allowedDurations` always
  // returns at least [1], so the fallback index is always populated.
  //
  // This has to live below `localSelectedPackage` rather than beside the
  // `duration` state it guards, because of the second exemption:
  //
  //  - While `costDataLoading` is true the ladder is PROVISIONAL:
  //    `hasActivePackage` starts false and only resolves from
  //    /api/user/active-packages. Clamping against a ladder we already know is
  //    incomplete is exactly how a legitimately-chosen 4 h would get silently
  //    cut to 3 h in the window before the package resolves. A package holder
  //    briefly seeing the 5-rung base ladder is accepted; rewriting their
  //    selection on the strength of it is not.
  //  - A selected Play & Food package fixes the duration and hides the picker
  //    entirely, so the ladder does not govern there. Packages are whole 1/2/3 h
  //    and are only offered when they fit the slot, so this is belt-and-braces —
  //    but it also stops a `?package=` deep link that outruns the slot from
  //    having its duration silently shortened out from under the package label.
  useEffect(() => {
    if (costDataLoading || localSelectedPackage) return;
    const ladder = allowedDurations({ maxHours: maxDuration, hasActivePackage });
    if (ladder.includes(duration)) return;
    setDuration(ladder[ladder.length - 1]);
  }, [duration, maxDuration, hasActivePackage, costDataLoading, localSelectedPackage]);

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

  /**
   * How much of this booking the package actually pays for. `null` means show
   * no card — no package, a Play & Food set selected (the set is priced as a
   * set and draws nothing down), or an unknown balance.
   *
   * Derived from the same `date`/`startTime`/`duration` inputs as
   * `costBreakdown` above, so the two always describe the same window.
   */
  const packageCoverage: PackageCoverage | null = (() => {
    if (!selectedDate || !selectedTime) return null;
    return computePackageCoverage({
      date: format(selectedDate, 'yyyy-MM-dd'),
      startTime: selectedTime,
      duration,
      hasActivePackage,
      packageDisplayName,
      remainingHours: packageBalance.remainingHours,
      isUnlimited: packageBalance.isUnlimited,
      playFoodPackageId: localSelectedPackage?.id ?? null,
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
      
      // Contact edits are scoped to this booking by default (owner-confirmed
      // 2026-07-25), with one exception: a field that was BLANK on the profile
      // gets filled. Overwriting a stored value needs the "also update my
      // account" tick; filling a gap does not, because nothing is lost and
      // refusing would quietly stop capturing emails for LINE customers (who
      // rarely have one on file, so never see the card, so never see the tick).
      // See `shouldWriteProfile` for the full reasoning.
      //
      // The booking payload below is unaffected either way: it always records
      // whatever was entered.
      const shouldUpdateProfile = shouldWriteProfile({
        profile,
        name,
        email,
        phoneNumber,
        alsoUpdateAccount,
      });

      // Update profile if needed
      if (shouldUpdateProfile && session?.user?.id) {
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
          // Google Ads click ID + UTMs, so the daily offline-conversion upload
          // has a click to attribute against. The server re-validates these.
          attribution: readAttribution(),
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

  // Returns the id of the first incomplete required field, or null if valid.
  // Order matters: it is the order the customer reads the form in.
  //
  // The three contact checks live in `firstIncompleteContactField` because
  // `IdentityCard` decides from the same function whether to replace those
  // inputs with a read-only card. Sharing it is what guarantees a flag can never
  // target a field the card has taken out of the DOM.
  const firstInvalidField = (): string | null => {
    const badContact = firstIncompleteContactField({ name, phoneNumber, email });
    if (badContact) return badContact;
    if (!selectedBayType && !selectedBay) return 'bd-bay';
    return null;
  };

  // Same check, narrowed to the fields the customer can actually see on the
  // sub-step they are on, so Continue on Session does not complain about a
  // blank email two screens away.
  //
  // Session and Extras have NO required fields today — duration defaults to 1,
  // people to 1, bay to 'social' and club rental to 'standard' — so Continue
  // never blocks on either of them. `bd-bay` is listed for completeness (it is
  // the Session sub-step's only anchor) but is unreachable while `selectedBay`
  // is seeded with a default.
  const firstInvalidFieldForSubStep = (s: DetailSubStep): string | null => {
    if (s === 'session') {
      if (!selectedBayType && !selectedBay) return 'bd-bay';
    }
    if (s === 'contact') {
      return firstIncompleteContactField({ name, phoneNumber, email });
    }
    return null;
  };

  // Flag a required field, navigate to the sub-step that owns it if we are not
  // already there, then scroll to it and focus its input.
  const flagAndRevealField = (fieldId: string) => {
    setErrorField(fieldId);
    const owner = SUB_STEP_FOR_FIELD[fieldId];
    const needsNavigation = !!owner && owner !== subStep;
    if (needsNavigation) goToSubStep(owner);
    // When we navigated, the target is still `display: none` this tick — a
    // hidden element is found by getElementById but cannot be scrolled to.
    // Defer past the re-render that unhides it.
    const reveal = () => {
      const el = document.getElementById(fieldId);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = el.querySelector('input, textarea, select') as HTMLElement | null;
      window.setTimeout(() => input?.focus({ preventScroll: true }), 350);
    };
    if (needsNavigation) {
      window.setTimeout(reveal, 0);
    } else {
      reveal();
    }
  };

  // Primary action for both the mobile sticky bar and the desktop summary rail.
  // Forward only: Continue while there is another sub-step, Confirm on the last
  // one. Never a silently disabled button — an incomplete required field flags
  // and scrolls instead.
  //
  // `submitNow` is what the desktop rail passes: above `lg:` all three sections
  // are on screen at once, so there is no sub-step to advance to and the rail's
  // button always confirms. It shares this function rather than carrying its own
  // copy so validation and jump-to-error stay in exactly one place.
  const handlePrimaryCta = (opts?: { submitNow?: boolean }) => {
    const confirming = opts?.submitNow === true || isLast;
    // Advancing validates only what is on screen; confirming validates the
    // whole form, so a field on an earlier sub-step can still stop the submit.
    const bad = confirming ? firstInvalidField() : firstInvalidFieldForSubStep(subStep);
    if (bad) {
      flagAndRevealField(bad);
      return;
    }
    setErrorField(null);
    if (!confirming) {
      nextSubStep();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    void handleSubmit();
  };

  return {
    // Props passed straight through so the JSX keeps reading the same names.
    selectedDate,
    selectedTime,
    selectedBayType,
    maxDuration,
    slotData,
    onBack,
    selectedClubRental,
    onClubRentalChange,
    selectedClubSetId,
    onClubSetIdChange,
    selectedAddOns,
    onAddOnsChange,
    // Mobile sub-step navigation, passed straight through from useBookingFlow.
    subStepNav,
    // i18n / navigation / session
    t,
    formatter,
    router,
    status,
    costLanguage,
    // Pricing tables (recreated per render, as before)
    PLAY_FOOD_PACKAGES,
    PREMIUM_CLUB_PRICING,
    PREMIUM_PLUS_CLUB_PRICING,
    // Form state
    duration,
    setDuration,
    selectedBay,
    setSelectedBay,
    phoneNumber,
    setPhoneNumber,
    email,
    setEmail,
    name,
    setName,
    numberOfPeople,
    setNumberOfPeople,
    customerNotes,
    setCustomerNotes,
    marketingOptIn,
    setMarketingOptIn,
    // Contact editing / write-back scope
    isEditingContact,
    setIsEditingContact,
    alsoUpdateAccount,
    setAlsoUpdateAccount,
    localSelectedPackage,
    setLocalSelectedPackage,
    // Submit / overlay state
    isSubmitting,
    loadingStep,
    showLoadingOverlay,
    loadingSteps,
    // Club rental availability
    availableClubSets,
    clubSetsLoading,
    // Two parallel error mechanisms — both preserved verbatim.
    errors,
    errorField,
    setErrorField,
    // Modals
    showNoAvailabilityModal,
    setShowNoAvailabilityModal,
    showBayInfoModal,
    setShowBayInfoModal,
    showPackageModal,
    setShowPackageModal,
    showClubRentalModal,
    setShowClubRentalModal,
    // Derived
    currentAvailability,
    /** Gates the 4 h and 5 h rungs of the duration ladder. Starts false and
        resolves from /api/user/active-packages, so the picker grows from 5 tiles
        to 7 for a package holder shortly after step 3 mounts. */
    hasActivePackage,
    /** Remaining-hours disclosure for the Extras panel. Null → render no card. */
    packageCoverage,
    packageBalance,
    packageDisplayName,
    isLineUser,
    costBreakdown,
    costDataLoading,
    // Handlers
    handleSubmit,
    handlePrimaryCta,
    formatDate,
  };
}
