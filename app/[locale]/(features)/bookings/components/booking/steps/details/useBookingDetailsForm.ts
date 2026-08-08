'use client';

import { useState, useEffect, useRef } from 'react';
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
import { useSession, signIn, getSession } from 'next-auth/react';
import type { Session } from 'next-auth';
import { isValidPhoneNumber } from 'react-phone-number-input';
import { isValidEmail } from '@/lib/email-format';
import type { PlayFoodPackage } from '@/types/play-food-packages';
import { getPlayFoodPackages } from '@/types/play-food-packages';
import { getPremiumClubPricing, getPremiumPlusClubPricing, formatClubRentalInfo, getGearUpItems } from '@/types/golf-club-rental';
import { usePricingLoader } from '@/lib/pricing-hook';
import { readAttribution } from '@/lib/attribution/click-ids';
import { pushBookingConfirmed } from '@/lib/booking-telemetry';
import type { RentalClubSetWithAvailability } from '@/types/golf-club-rental';
import { BayType } from '@/lib/bayConfig';
import type { TimeSlot } from '../../../../hooks/useAvailability';
import { calculateCost, type ApplicablePromotion, type CostBreakdown } from '@/lib/cost-calculator';
import { computePackageCoverage, type PackageCoverage } from '@/lib/package-coverage';
import { allowedDurations, bayTypeHeadroom } from '@/lib/booking-durations';
import type { CreditGrantBalance } from './CreditBalanceCard';
import type { DetailSubStep, DetailsSubStepNav } from './useDetailsSubStep';
import { firstIncompleteContactField } from './IdentityCard';
import { shouldWriteProfile } from './profileWriteBack';
import { formatFlowDate } from './summarySubline';
import { localePath } from '@/i18n/locale-path';
import { takeContactDraft } from './contactDraft';
import { toE164 } from '@/lib/phone-e164';
import { saveClaimToken } from '../../claimHandoff';

/**
 * The balance half of `/api/user/active-packages`.
 *
 * `remainingHours` + `isUnlimited` are PRICING inputs: they reach
 * `calculateCost`, which charges the uncovered tail when the balance runs short
 * so the estimated total agrees with the package card. They are null/false until
 * the fetch resolves, which the calculator treats as "unknown" and prices
 * exactly as it did before balances existed — no ฿0 → charge → ฿0 flicker.
 *
 * `totalHours`/`usedHours`/`expiryDate` are display-only (the card's meter).
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
  /**
   * The session length and the party size, owned by `useBookingFlow`.
   *
   * Controlled rather than local because step 3 UNMOUNTS on the way back to
   * step 2 — `handleBack` nulls `selectedTime` and `page.tsx` gates step 3 on
   * it — so a `useState` here is reset by the very navigation the session
   * chip's "Change" now advertises. See the block comment on the state in
   * `useBookingFlow` for why these two are safe to carry across a slot change
   * and which one still needs the ladder clamp below.
   *
   * BOTH SETTERS MUST BE REFERENTIALLY STABLE. `useBookingFlow` returns
   * `useState` setters and `page.tsx` passes them straight through, which
   * satisfies this — but an inline lambda at the call site would break it in a
   * way nothing else here would catch. Two effects below now list
   * `onDurationChange` in their dependencies (they must; it is a prop, not a
   * setter the linter can see is stable), and one of them is the package
   * pre-fill. Re-running that on every render would rewrite the duration back to
   * the set's length each time, silently overruling the customer's own choice
   * on the ladder.
   */
  duration: number;
  onDurationChange: (value: number) => void;
  numberOfPeople: number;
  onNumberOfPeopleChange: (value: number) => void;
  /**
   * The note and the marketing consent, owned by `useBookingFlow` for the same
   * reason `duration` and `numberOfPeople` are: leaving step 3 unmounts this
   * component, and anything held in a `useState` here dies with it. The step
   * header's "Change" makes that trip reachable from the review sub-step, one
   * tap from Confirm, with a typed note on screen.
   */
  customerNotes: string;
  onCustomerNotesChange: (value: string) => void;
  marketingOptIn: boolean;
  onMarketingOptInChange: (value: boolean) => void;
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
 *
 * All three live on `contact`, which is not an accident waiting to be
 * simplified away: the map is what lets a required field be added to any
 * sub-step without the jump-to-error logic having to learn about it. The
 * Session sub-step has no required field at all now that the bay arrives
 * already chosen — its `bd-bay` entry pointed at a picker that no longer
 * exists, so it is gone rather than left as an anchor to nothing.
 */
const SUB_STEP_FOR_FIELD: Record<string, DetailSubStep> = {
  'bd-name': 'contact',
  'bd-phone': 'contact',
  'bd-email': 'contact',
};

export function useBookingDetailsForm({
  selectedDate,
  selectedTime,
  selectedBayType,
  maxDuration,
  duration,
  onDurationChange: setDuration,
  numberOfPeople,
  onNumberOfPeopleChange: setNumberOfPeople,
  customerNotes,
  onCustomerNotesChange: setCustomerNotes,
  marketingOptIn,
  onMarketingOptInChange: setMarketingOptIn,
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
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  /**
   * Has the customer touched the contact fields themselves?
   *
   * Prefill arrives from two async sources (`/api/vip/profile`, then `profiles`
   * as a fallback) that resolve whenever the network says so — which can be
   * AFTER someone has started typing. Without this guard a slow fetch silently
   * replaces what they wrote, and the faster your connection the less likely
   * you are to catch it in testing.
   *
   * A ref rather than state: it must be readable inside those effects without
   * re-running them, and setting it must not trigger a render.
   */
  const userEditedContact = useRef(false);

  /**
   * The same fact as `userEditedContact`, as STATE rather than a ref, because
   * this one has to drive a render.
   *
   * `YourDetailsStep` gates the read-only `IdentityCard` on it: the card may
   * only stand in for the three inputs when prefill supplied the values, never
   * when the customer is typing them. Gating on the values alone let the card
   * appear mid-keystroke and unmount the field under the cursor — see the block
   * comment on `showIdentityCard` for the bookings that cost us.
   *
   * The ref cannot serve here, and neither can replace the other. Mutating a ref
   * schedules no re-render, so the card would only pick the change up on the
   * next unrelated render. Conversely the ref must STAY a ref: it is read inside
   * the prefill effects' functional updaters, whose dependency arrays do not
   * list it, so as state it would close over a stale `false` and re-open the
   * prefill-clobbers-typing bug it exists to prevent.
   */
  const [contactTouched, setContactTouched] = useState(false);

  /**
   * Latch both guards. They are two representations of ONE fact — the customer
   * has typed — and a setter that raised only one would fail silently in a
   * different way each time: miss the ref and prefill overwrites what they
   * wrote; miss the state and the card unmounts the field mid-keystroke. Raising
   * them together in one place is what makes that unrepresentable.
   */
  const markContactTouched = () => {
    userEditedContact.current = true;
    setContactTouched(true);
  };

  /**
   * The setters this hook hands out. Anything set through these came from a
   * customer keystroke. Prefill uses the raw setters and so cannot trip them.
   */
  const setNameEdited = (value: string) => {
    markContactTouched();
    setName(value);
  };
  const setEmailEdited = (value: string) => {
    markContactTouched();
    setEmail(value);
  };
  const setPhoneNumberEdited = (value: string | undefined) => {
    markContactTouched();
    setPhoneNumber(value);
  };

  /**
   * Restore whatever the customer had typed before leaving for a provider.
   *
   * Runs once on mount, BEFORE the profile and VIP prefill effects have
   * resolved, and `takeContactDraft` clears the key as it reads — so this can
   * only ever fire for the one navigation it was written for.
   *
   * Fills blanks only. If prefill somehow won the race, what the profile
   * supplied is at least as good as what the customer typed, and overwriting it
   * would make the fields flicker between two values.
   */
  useEffect(() => {
    const draft = takeContactDraft();
    if (!draft) return;
    if (draft.name) setName((current) => current || draft.name);
    if (draft.email) setEmail((current) => current || draft.email);
    if (draft.phoneNumber) setPhoneNumber((current) => current || draft.phoneNumber);
  }, []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);

  /**
   * The customer's EXISTING marketing consent on `customers.marketing_opt_in`,
   * as reported by `/api/vip/profile`. Purely presentational: it decides
   * whether the opt-in checkbox is worth showing, and never feeds the payload.
   * `marketingOptIn` above stays the fresh consent this booking is asking for.
   *
   * Tri-state, and the distinction is the whole point — same `?? null`
   * discipline as `packageBalance` and `creditBalance` above:
   *
   *   `true`  → already subscribed. Showing them an unticked "Send me LENGOLF
   *             news & offers" tells them they are not, which is a lie.
   *   `false` → deliberately opted out. Must still see the box; it is their
   *             way back in.
   *   `null`  → not loaded yet, guest, or no linked customer record. Must ALSO
   *             still see the box. Treating unknown as subscribed would let a
   *             slow fetch silently cost a customer the chance to opt in, and
   *             a fetch is exactly what this is waiting on.
   *
   * So only `true` suppresses. Everything else renders the checkbox.
   */
  const [marketingPreference, setMarketingPreference] = useState<boolean | null>(null);
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
   * `getActivePackageDetailsForCustomer`. `remainingHours`/`isUnlimited` feed the
   * cost calculator as well as the card, so a balance that runs short moves the
   * charged total instead of leaving a ฿0 preview to be corrected at the bay.
   */
  const [packageBalance, setPackageBalance] = useState<PackageBalance>(NO_PACKAGE_BALANCE);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [applicablePromotions, setApplicablePromotions] = useState<ApplicablePromotion[]>([]);
  const [costDataLoading, setCostDataLoading] = useState(true);

  /**
   * Free simulator hours the customer already holds — today, the B1G1 hour a
   * previous one-hour booking earned them.
   *
   * `null` until the fetch resolves, `[]` for a genuine zero balance. Same
   * `?? null` convention as `packageBalance` above: a balance that has not
   * loaded is NOT a zero balance. Both render nothing, so the distinction is
   * invisible today — it stops mattering only if something later branches on
   * "has no credits", which would be wrong for the unloaded state.
   *
   * Display only. Credits do NOT reach `calculateCost`; customers cannot
   * self-redeem and the quoted total is unaffected.
   */
  const [creditBalance, setCreditBalance] = useState<CreditGrantBalance[] | null>(null);

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

  // Credit balance, deliberately its OWN effect rather than a third leg of the
  // Promise.all above. Nothing here feeds pricing or the duration ladder, so a
  // failure must not be able to take the package and promotion fetches down
  // with it — that shared `catch` would leave the ladder and the quote empty
  // over a purely decorative card.
  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    fetch('/api/user/credit-balance')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        // The route never 401s and degrades to `{ credits: [] }` on every
        // failure path, so anything unexpected here reads as "no credits" —
        // which renders nothing, the safe outcome.
        setCreditBalance(Array.isArray(data?.credits) ? data.credits : []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[credit-balance] fetch failed:', err);
        // Stays null — unknown, not zero.
      });
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

  // Reaching this step no longer requires a session. It used to redirect on
  // mount, which meant an anonymous customer who got this far — via a deep
  // link, a restored flow, or an expired session — was thrown out of the form
  // rather than allowed to finish it.
  //
  // The history is worth keeping because it shows how easily this breaks: the
  // redirect originally pointed at `/auth/signin`, which is not a page in this
  // app (the login page is `/auth/login`; `/api/auth/signin` is NextAuth's API
  // route), so it 404'd customers straight out of the flow. That was fixed in
  // the embedded-browser work (c30d562) against BookingDetails.tsx, then had to
  // be ported here by hand when slice 8 extracted this effect, or the fix would
  // have been silently dropped in the merge.
  //
  // Contact details are collected on this step anyway, which is exactly what
  // the guest provider needs — so identity is established at submit instead.

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
            
            // The CRM record is the GOOD prefill source: it carries a name and
            // phone for 100% of linked customers, where `profiles` has a phone
            // for only ~6% of Google accounts. Blanks only, though — a fetch
            // that resolves after the customer started typing must not
            // overwrite them.
            if (vipProfile.name) {
              setName((current) =>
                userEditedContact.current || current ? current : vipProfile.name
              );
            }
            if (vipProfile.email) {
              setEmail((current) =>
                userEditedContact.current || current ? current : vipProfile.email
              );
            }
            if (vipProfile.phoneNumber) {
              // Shared with the browser-autofill path — see lib/phone-e164. It
              // used to live here inline, which is why an autofilled local-format
              // number went in raw and rendered as invalid.
              const formatted = toE164(vipProfile.phoneNumber);
              if (formatted) {
                setPhoneNumber((current) =>
                  userEditedContact.current || current ? current : formatted
                );
              }
            }
            
            // `/api/vip/profile` returns `marketing_opt_in ?? null`, so an
            // unlinked or not-yet-known customer arrives as null and must stay
            // null. The explicit `typeof === 'boolean'` rather than a truthy
            // check keeps a stray `undefined` (older cached payload in
            // sessionStorage, written before this field existed) out of the
            // `false` bucket, where it would read as a deliberate opt-out.
            setMarketingPreference(
              typeof vipProfile.marketingPreference === 'boolean'
                ? vipProfile.marketingPreference
                : null,
            );

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

            // Also PREFILL from it. This used to set `profile` and nothing
            // else — the state's only consumer was the write-back diff at
            // submit — so a customer whose `/api/vip/profile` call failed or
            // returned nothing was shown an empty form even though we held
            // their details. Both of that route's failure paths are silent
            // `return`s, which is why it went unnoticed.
            //
            // A weak source, and treated as one: `profiles` carries a phone for
            // only ~6% of Google accounts, so this is strictly a fallback that
            // fills what the CRM record did not. Same two rules as above —
            // never over typing, never over an existing value.
            if (profileData.display_name) {
              setName((current) =>
                userEditedContact.current || current ? current : profileData.display_name
              );
            }
            if (profileData.email) {
              setEmail((current) =>
                userEditedContact.current || current ? current : profileData.email
              );
            }
            if (profileData.phone_number) {
              const formatted = toE164(profileData.phone_number);
              if (formatted) {
                setPhoneNumber((current) =>
                  userEditedContact.current || current ? current : formatted
                );
              }
            }
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
  }, [selectedPackage, setDuration]);

  /* No bay auto-select / auto-switch effect any more.
   *
   * It existed solely for the step-3 picker: it pre-selected the only available
   * type, and re-selected the other one with a toast when a duration change made
   * the chosen one impossible. Both only ever ran when `selectedBayType` was
   * unset — i.e. exactly the "All Bays" case that is now a deliberate answer
   * meaning no preference, where there is nothing to auto-select toward.
   *
   * A customer who DID name a type cannot stretch the duration past what that
   * type can fit in the first place — `maxBookableHours` below caps the ladder
   * at the chosen type's own headroom — so there is nothing left for an
   * auto-switch to rescue. That matters because the rescue was never silent
   * enough to be safe: `/api/bookings/create` treats the type as a preference
   * and falls back to any free bay, so a mismatch here does not fail the
   * booking, it just quietly books a different bay from the one five surfaces
   * of this step have been naming. */

  // Local state for package selector to allow switching
  const [localSelectedPackage, setLocalSelectedPackage] = useState<PlayFoodPackage | null>(selectedPackage || null);

  /**
   * The longest session THIS BOOKING can actually have: the slot's own headroom,
   * narrowed to what the bay type chosen on step 2 can serve.
   *
   * `maxDuration` on its own is the headroom of whichever bay lasts longest, not
   * of the one the customer picked — see `bayTypeHeadroom` for why the two come
   * apart and what the flow used to promise as a result. This is the only value
   * that governs a length from here on: the duration ladder, the Play & Food set
   * cards and the sets modal all read it, so none of them can offer a length
   * that ends with the server silently assigning a different bay.
   *
   * This is also what finally consumes `slotData`, which has been threaded from
   * `useBookingFlow` through `BookingDetails` into this hook and read by nothing.
   */
  const maxBookableHours = bayTypeHeadroom({
    bayAvailabilityByDuration: slotData?.bayAvailabilityByDuration,
    bayType: selectedBayType,
    maxHours: maxDuration,
  });

  // Keep the selected duration on the allowed ladder. If the ladder no longer
  // contains it — the customer stepped back and picked a slot with less
  // headroom, or the chosen bay type cannot serve the length they were on —
  // fall back to the longest rung that still fits, so the form can never hold a
  // duration the server will reject. `allowedDurations` always returns at least
  // [1], so the fallback index is always populated.
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
    const ladder = allowedDurations({ maxHours: maxBookableHours, hasActivePackage });
    if (ladder.includes(duration)) return;
    setDuration(ladder[ladder.length - 1]);
  }, [duration, maxBookableHours, hasActivePackage, costDataLoading, localSelectedPackage, setDuration]);

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
      // Balance-aware: a package with 1 h left against a 1.5 h booking charges
      // the 0.5 h tail instead of previewing ฿0. `null` while the fetch is in
      // flight, which the calculator prices as "unknown balance".
      packageRemainingHours: packageBalance.remainingHours,
      packageIsUnlimited: packageBalance.isUnlimited,
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
    // Missing and malformed are separate messages on purpose: "email is
    // required" beside a field the customer has visibly filled in reads as a
    // broken form, and they retype the same value. Mirrors the phone pair below.
    if (!email) {
      currentErrors.email = tErrors('emailRequired');
      isValid = false;
    } else if (!isValidEmail(email)) {
      currentErrors.email = tErrors('emailInvalid');
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

    // No bay-type check. The bay is settled on step 2 and "All Bays" (null) is
    // a valid answer, so there is no state this form can be in where the bay is
    // missing — a required-field error for it could only ever be a false alarm.

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

    // Start timing the submission process
    const submissionStartTime = Date.now();
    setIsSubmitting(true);
    setShowLoadingOverlay(true);
    setLoadingStep(0);

    try {
      // No session? Mint a guest one from what the customer has already typed.
      //
      // `validateForm()` above has just guaranteed name, email and phone are
      // present and well formed — which is precisely what the guest provider
      // needs. So identity can be established here, silently, instead of
      // bouncing the customer to a login page and losing their place. This is
      // the last of the six gates, and the only one that becomes something
      // rather than simply going away.
      //
      // Deliberately passes NO marketing flag: consent is written exactly once,
      // by the booking route, from `marketingOptIn` below. Sending it here too
      // would write it twice under two different sources and defeat the audit
      // trail `marketing_opt_in_source` exists for.
      if (!session) {
        const result = await signIn('guest', {
          name,
          email,
          phone: phoneNumber,
          redirect: false,
        });

        if (!result?.ok) {
          // Distinct from a booking failure, and it must not read as one — the
          // booking has not been attempted yet and the customer's form is
          // untouched, so the honest thing is to let them try again.
          setIsSubmitting(false);
          setShowLoadingOverlay(false);
          toast.error(tErrors('signInToContinue'));
          return;
        }

        // The route authenticates from the httpOnly cookie via getToken(), which
        // is already set by the time the call above resolves — so this is not
        // what makes the POST work. It warms next-auth's CLIENT cache, so the
        // re-render into `authenticated` does not race the in-flight submit.
        // GuestForm carries the same call for the same reason, after a customer
        // was observed double-submitting 12 seconds apart.
        await getSession();
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

      // Update profile if needed.
      //
      // `session` is the value this render closed over, so for a guest minted a
      // few lines above it is still null and this is skipped. That is correct,
      // not a gap: the guest provider's `authorize` has just written the name
      // and phone with the service role, under its own fill-blanks-only rule.
      // Repeating the write here would be redundant, and — because it does NOT
      // apply that rule — could overwrite a stored value the provider
      // deliberately preserved. Do not "fix" this by reaching for a fresh
      // session.
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
          // Same field, same accepted values, one source instead of two. `null`
          // is "All Bays" / no preference, which the route already handles by
          // assigning whichever bay is free — the shape LIFF has always sent.
          preferred_bay_type: selectedBayType ?? null,
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

      const { booking } = createData;

      // Hold the claim token the create response issued, if any. It is only
      // present for a guest booking, and it is the ONLY proof that this browser
      // is the one that made this booking — the confirmation upsell has nothing
      // to offer without it. Stored here rather than minted on the confirmation
      // page, because there the only available proof is a session, and a guest
      // session resolves on email alone.
      if (typeof createData.claimToken === 'string' && createData.claimToken) {
        saveClaimToken({ bookingId: booking.id, token: createData.claimToken });
      }

      // The conversion signal for GA4, Google Ads and the Meta Pixel. Pushed
      // here rather than scraped off the button by GTM, because the button says
      // "ยืนยันการจอง" / "予約を確定" / "예약 확정" / "确认预约" outside English and
      // the click trigger has never matched any of them. Pushed after the
      // create call succeeds, so a failed attempt no longer counts.
      pushBookingConfirmed({
        bookingId: booking.id,
        surface: 'web',
        locale,
        email,
        phoneNumber,
        isNewCustomer: booking.is_new_customer === true,
      });

      // There is no notification status to check any more. The confirmation
      // email and the staff LINE message are dispatched after the response, so
      // the server cannot report on them here — and a confirmed booking is a
      // confirmed booking whether or not the email has landed yet. Delivery
      // failures are logged server-side and show up in `booking_process_logs`.


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

  /* Goes through the same module as the sticky bar's short date, so the two
     agree on field order. They render about 100px apart on the last sub-step
     and used to disagree: "Wed, Jul 29, 2026" above "Wed 29 Jul". */
  const formatDate = (date: Date) => formatFlowDate(locale, date);

  /* The short date the sticky bar shows is NOT defined here. It lives in
     `details/summarySubline.ts` as a free function taking a `locale`, so the
     suite can call the real formatting instead of restating its option set in
     a probe. `BookingDetails` composes it via `summaryBarSublineFor`, passing
     the `locale` this hook returns below — not next-intl's `formatter`, which
     is bound to the app locale and so cannot compose English as `en-GB`. */

  const isLineUser = session?.user?.provider === 'line';
  // Drives the in-flow sign-in row. `status` rather than `!!session` so the
  // row does not flash in during the brief 'loading' window for a customer
  // who IS signed in and should never be offered it.
  const isSignedIn = status === 'authenticated';
  /**
   * Return target for the in-flow sign-in row.
   *
   * MUST stay query-free: `useBookingFlow` treats `selectDate`/`package`/`club`
   * as a deep link and skips its sessionStorage restore entirely, so one stray
   * parameter here silently discards the in-progress booking on the way back.
   */
  const signInCallbackUrl = localePath('/bookings', locale);

  // Returns the id of the first incomplete required field, or null if valid.
  // Order matters: it is the order the customer reads the form in.
  //
  // The three contact checks live in `firstIncompleteContactField` because
  // `IdentityCard` decides from the same function whether to replace those
  // inputs with a read-only card. Sharing it is what guarantees a flag can never
  // target a field the card has taken out of the DOM.
  const firstInvalidField = (): string | null =>
    firstIncompleteContactField({ name, phoneNumber, email });

  // Same check, narrowed to the fields the customer can actually see on the
  // sub-step they are on, so Continue on Session does not complain about a
  // blank email two screens away.
  //
  // Session and Extras have NO required fields — duration defaults to 1, people
  // to 1, club rental to 'standard', and the bay arrives already chosen from
  // step 2 (with "All Bays" a legitimate answer) — so Continue never blocks on
  // either of them and only `contact` has anything to check.
  const firstInvalidFieldForSubStep = (s: DetailSubStep): string | null => {
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
    /* Deliberately NOT the raw `maxDuration` prop. Every consumer must get the
       bay-aware cap, and the only way to guarantee that is to stop handing out
       the wider number at all — a second, longer-looking value in scope is
       exactly how the ladder came to offer lengths the chosen bay cannot serve. */
    maxBookableHours,
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
    /** For `summaryBarSublineFor`, which resolves its own short-date tag. */
    locale,
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
    phoneNumber,
    // The EXPORTED setters mark the field as customer-edited; the raw ones stay
    // internal for prefill. Wrapping here rather than asking every call site to
    // remember means the guard cannot be forgotten when a new input is added —
    // and the only way to set these from outside the hook is through a
    // customer's own keystroke.
    setPhoneNumber: setPhoneNumberEdited,
    email,
    setEmail: setEmailEdited,
    name,
    setName: setNameEdited,
    numberOfPeople,
    setNumberOfPeople,
    customerNotes,
    setCustomerNotes,
    marketingOptIn,
    setMarketingOptIn,
    /** Existing consent. Display only — `true` hides the opt-in, `false`/`null` show it. */
    marketingPreference,
    // Contact editing / write-back scope
    contactTouched,
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
    showPackageModal,
    setShowPackageModal,
    showClubRentalModal,
    setShowClubRentalModal,
    // Derived
    /** Gates the 4 h and 5 h rungs of the duration ladder. Starts false and
        resolves from /api/user/active-packages, so the picker grows from 5 tiles
        to 7 for a package holder shortly after step 3 mounts. */
    hasActivePackage,
    /** Remaining-hours disclosure for the Extras panel. Null → render no card. */
    packageCoverage,
    packageBalance,
    /** Free-hour credits. Null → not loaded; `[]` → none. Both render no card. */
    creditBalance,
    packageDisplayName,
    isLineUser,
    isSignedIn,
    signInCallbackUrl,
    costBreakdown,
    costDataLoading,
    // Handlers
    handleSubmit,
    handlePrimaryCta,
    formatDate,
  };
}
