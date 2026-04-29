'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { useTranslations, useFormatter } from 'next-intl';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { Layout } from '@/app/[locale]/(features)/bookings/components/booking/Layout';
import { ArrowLeftIcon, CheckIcon, InformationCircleIcon, MapPinIcon, TruckIcon, PhoneIcon } from '@heroicons/react/24/outline';
import { FaLine } from 'react-icons/fa';
import type { RentalClubSetWithAvailability, ClubRentalAddOn } from '@/types/golf-club-rental';
import { getCoursePriceBreakdown, getGearUpItems, getSetThumbnailUrl } from '@/types/golf-club-rental';
import { usePricingLoader } from '@/lib/pricing-hook';
import { pushEventToGtm } from '@/utils/gtm';

const STORAGE_BASE = 'https://bisimqmtxjsptehhqpeg.supabase.co/storage/v1/object/public/website-assets';

// Per-set image galleries keyed by slug or tier+gender
const SET_IMAGES: Record<string, { src: string; alt: string }[]> = {
  'premium-plus_mens': [
    { src: `${STORAGE_BASE}/clubs/premium-plus/2.png`, alt: 'Callaway Paradym full set' },
    { src: `${STORAGE_BASE}/clubs/premium-plus/4.png`, alt: 'Paradym driver' },
    { src: `${STORAGE_BASE}/clubs/premium-plus/11.png`, alt: 'Paradym irons' },
    { src: `${STORAGE_BASE}/clubs/premium-plus/9.png`, alt: 'Paradym fairway wood' },
    { src: `${STORAGE_BASE}/clubs/premium-plus/13.png`, alt: 'Jaws Raw wedges' },
    { src: `${STORAGE_BASE}/clubs/premium-plus/15.png`, alt: 'Odyssey putter' },
    { src: `${STORAGE_BASE}/clubs/premium-plus/12.png`, alt: 'Ventus TR shaft' },
    { src: `${STORAGE_BASE}/clubs/premium-plus/1.png`, alt: 'Callaway golf bag' },
  ],
  'premium_mens': [
    { src: `${STORAGE_BASE}/clubs/warbird/warbird-full-set.webp`, alt: 'Callaway Warbird full set' },
  ],
  'premium_womens': [
    { src: `${STORAGE_BASE}/clubs/premium-womens/majesty-shuttle-full-set.jpg`, alt: 'Majesty Shuttle full set' },
  ],
};

function getSetImageKey(set: { tier: string; gender: string }): string {
  return `${set.tier}_${set.gender}`;
}

// Preview sets shown on Step 1 (dates) as orientation - not a selection UI.
// Real availability-filtered selection happens on Step 2.
// Image URLs come from getSetThumbnailUrl() so they stay in sync with the
// booking selector and the rental-options modal. Set names are brand names
// kept untranslated; meta strings resolve via i18n at render time.
const PREVIEW_SETS = [
  { img: getSetThumbnailUrl({ tier: 'premium', gender: 'mens' }), name: 'Callaway Warbird', metaKey: 'metaMensPremium' as const },
  { img: getSetThumbnailUrl({ tier: 'premium', gender: 'womens' }), name: 'Majesty Shuttle', metaKey: 'metaLadiesPremium' as const },
  { img: getSetThumbnailUrl({ tier: 'premium-plus', gender: 'mens' }), name: 'Callaway Paradym', metaKey: 'metaMensPremiumPlus' as const },
];

const TIME_OPTIONS = [
  '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
  '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
  '21:00', '22:00',
];

type Step = 'dates' | 'set' | 'delivery' | 'contact' | 'review' | 'confirmation';

const STEP_ORDER: Step[] = ['dates', 'set', 'delivery', 'contact', 'review'];

export default function CourseRentalPage() {
  usePricingLoader();
  const { data: session, status: authStatus } = useSession();
  const t = useTranslations('courseRental');
  const tClubRental = useTranslations('clubRental');
  const format = useFormatter();
  const GEAR_UP_ITEMS = getGearUpItems();
  const [step, setStep] = useState<Step>('dates');
  const [availableSets, setAvailableSets] = useState<RentalClubSetWithAvailability[]>([]);
  const [setsLoading, setSetsLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);
  const [lightboxImages, setLightboxImages] = useState<{ src: string; alt: string }[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Selections
  const [selectedSet, setSelectedSet] = useState<RentalClubSetWithAvailability | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [deliveryRequested, setDeliveryRequested] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [addOns, setAddOns] = useState<ClubRentalAddOn[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('card');
  const [preferredContact, setPreferredContact] = useState<'line' | 'email' | 'whatsapp'>('line');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState<string | undefined>(undefined);
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [profilePrefilled, setProfilePrefilled] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [rentalCode, setRentalCode] = useState('');
  const [error, setError] = useState('');

  // Calculate duration from start/end dates
  const durationDays = (startDate && endDate)
    ? Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Today's date for min
  const todayStr = (() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  })();

  // Fetch available sets filtered by selected dates
  const fetchSets = useCallback(async () => {
    if (!startDate || !endDate) return;
    setSetsLoading(true);
    try {
      const url = `/api/clubs/availability?type=course&date=${startDate}&end_date=${endDate}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setAvailableSets(data.sets || []);
    } catch {
      setAvailableSets([]);
    } finally {
      setSetsLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchSets();
  }, [fetchSets]);

  // Reset hero index when selected set changes
  useEffect(() => {
    setHeroIndex(0);
  }, [selectedSet?.id]);

  // Prefill contact fields for logged-in customers from VIP profile.
  // Mirrors the BookingDetails approach (sessionStorage cache + /api/vip/profile).
  useEffect(() => {
    if (authStatus !== 'authenticated' || !session?.user?.id || profilePrefilled) return;

    let cancelled = false;

    const loadProfile = async () => {
      try {
        const cacheKey = `vip_profile_${session.user.id}`;
        let vipProfile: { name?: string; email?: string; phoneNumber?: string } | null = null;

        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Date.now() - (parsed.timestamp ?? 0) < 5 * 60 * 1000) {
              vipProfile = parsed.data;
            }
          } catch {
            // stale cache, fall through
          }
        }

        if (!vipProfile) {
          const res = await fetch('/api/vip/profile');
          if (!res.ok) return;
          vipProfile = await res.json();
          sessionStorage.setItem(cacheKey, JSON.stringify({ data: vipProfile, timestamp: Date.now() }));
        }

        if (cancelled || !vipProfile) return;

        // Only fill empty fields so we never clobber what the user already typed.
        if (vipProfile.name) setContactName(prev => prev || vipProfile!.name!);
        if (vipProfile.email) setContactEmail(prev => prev || vipProfile!.email!);
        if (vipProfile.phoneNumber) {
          let formatted = vipProfile.phoneNumber;
          // Normalize Thai numbers into E.164 (react-phone-number-input expects +NNN...).
          if (!formatted.startsWith('+')) {
            if (formatted.startsWith('0') && formatted.length === 10) {
              formatted = '+66' + formatted.slice(1);
            } else if (formatted.length === 9) {
              formatted = '+66' + formatted;
            }
          }
          setContactPhone(prev => prev || formatted);
        }

        setProfilePrefilled(true);
      } catch {
        // silent - guest fallback still works
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [authStatus, session?.user?.id, profilePrefilled]);

  // Pricing — optimal combo
  const breakdown = (selectedSet && durationDays > 0) ? getCoursePriceBreakdown(selectedSet, durationDays) : null;
  const rentalPrice = breakdown?.total || 0;
  const addOnsTotal = addOns.reduce((sum, a) => sum + a.price, 0);
  const deliveryFee = deliveryRequested ? 500 : 0;
  const totalPrice = rentalPrice + addOnsTotal + deliveryFee;

  const toggleAddOn = (key: string, label: string, price: number) => {
    setAddOns(prev =>
      prev.find(a => a.key === key)
        ? prev.filter(a => a.key !== key)
        : [...prev, { key, label, price }]
    );
  };

  const goBack = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  };

  const goNext = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1]);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/clubs/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rental_club_set_id: selectedSet!.id,
          rental_type: 'course',
          start_date: startDate,
          end_date: endDate,
          start_time: pickupTime || undefined,
          duration_days: durationDays,
          customer_name: contactName,
          customer_email: contactEmail || undefined,
          customer_phone: contactPhone,
          add_ons: addOns,
          delivery_requested: deliveryRequested,
          delivery_address: deliveryRequested ? deliveryAddress : undefined,
          delivery_time: pickupTime || undefined,
          return_time: returnTime || undefined,
          notes: [
            `Payment: ${paymentMethod === 'cash' ? 'Cash (at LENGOLF)' : 'Online (ShopeePay — credit/debit card or wallet)'}`,
            `Contact via: ${preferredContact === 'line' ? 'LINE' : preferredContact === 'email' ? 'Email' : 'WhatsApp'}`,
            notes,
          ].filter(Boolean).join('\n') || undefined,
          source: 'website' as const,
          payment_method: paymentMethod,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('errors.failedToCreate'));
        return;
      }

      setRentalCode(data.rental_code);

      // Push conversion event to GTM for Google Ads tracking
      pushEventToGtm('course_rental_confirmed', {
        enhanced_conversions: {
          email: contactEmail?.toLowerCase().trim() || undefined,
          phone_number: contactPhone || undefined,
        },
        conversion_value: totalPrice,
        currency: 'THB',
        rental_code: data.rental_code,
        club_set: selectedSet?.name,
        duration_days: durationDays,
        delivery_requested: deliveryRequested,
      });

      // If the customer chose card (and for delivery, this is forced),
      // hand off to the ShopeePay flow. Otherwise stay on the in-page
      // confirmation step as today.
      if (data.requires_prepay) {
        // Use locale-aware navigation so /th/course-rental → /th/payment/start
        // rather than the unprefixed root.
        const localePrefix = window.location.pathname.match(/^\/(en|th|ko|ja|zh)(\/|$)/)?.[1];
        const prefix = localePrefix ? `/${localePrefix}` : '';
        window.location.href = `${prefix}/payment/start?ref=${encodeURIComponent(data.rental_code)}`;
        return;
      }

      setStep('confirmation');
    } catch {
      setError(t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndex = STEP_ORDER.indexOf(step);
  const isConfirmation = step === 'confirmation';

  return (
    <Layout hidePromotionBar hideNav>
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {/* Header with back button */}
        <div className="mb-6 flex items-start">
          {stepIndex > 0 && !isConfirmation && (
            <button
              onClick={goBack}
              className="mr-4 p-2 rounded-lg hover:bg-gray-100"
              aria-label={t('page.backAriaLabel')}
            >
              <ArrowLeftIcon className="h-6 w-6 text-gray-600" />
            </button>
          )}
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {isConfirmation ? t('page.headingConfirmed') : t(`stepLabels.${step}`)}
            </h2>
            <p className="text-gray-600 mt-1 text-sm">
              {step === 'dates' && t('page.subtitleDates')}
              {step === 'set' && t('page.subtitleSet')}
              {step === 'delivery' && t('page.subtitleDelivery')}
              {step === 'contact' && t('page.subtitleContact')}
              {step === 'review' && t('page.subtitleReview')}
              {isConfirmation && t('page.subtitleConfirmation')}
            </p>
          </div>
        </div>

        {/* Step 2: Set Selection */}
        {step === 'set' && (
          <div className="space-y-4">
            {/* Selected dates summary */}
            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between text-sm">
              <span className="text-gray-600">
                {t('set.daysCount', { count: durationDays })}
                <span className="mx-1.5">&middot;</span>
                {format.dateTime(new Date(`${startDate}T00:00:00+07:00`), { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' })}
                {' '}-{' '}
                {format.dateTime(new Date(`${endDate}T00:00:00+07:00`), { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' })}
              </span>
            </div>

            {/* Handedness note */}
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-xs sm:text-sm">
              <p className="font-semibold text-green-800">{tClubRental('sets.handednessNoteTitle')}</p>
              <p className="mt-0.5 text-gray-700">{tClubRental('sets.handednessNote')}</p>
            </div>

            {setsLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : availableSets.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg font-medium mb-2">{t('set.noSetsTitle')}</p>
                <p className="text-sm">{t('set.noSetsBody')}</p>
              </div>
            ) : (
              availableSets.map(set => {
                const isAvailable = set.available_count > 0;
                const isSelected = selectedSet?.id === set.id;
                const images = SET_IMAGES[getSetImageKey(set)] || [];
                const heroImg = images[0];
                const activeImg = isSelected && images.length > 1 ? images[heroIndex % images.length] : heroImg;
                return (
                  <div key={set.id} className="space-y-2">
                    <button
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => setSelectedSet(set)}
                      className={`w-full text-left rounded-xl border-2 transition-all overflow-hidden ${
                        isSelected
                          ? 'border-green-600 bg-white shadow-md'
                          : isAvailable
                          ? 'border-gray-200 bg-white hover:border-green-300 hover:shadow-sm'
                          : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex">
                        {/* Square thumbnail on left */}
                        <div
                          className={`relative w-28 sm:w-36 flex-shrink-0 bg-gray-50 flex items-center justify-center ${heroImg ? '' : 'bg-gray-100'} ${isSelected && images.length > 1 ? 'cursor-zoom-in' : ''}`}
                          onClick={isSelected && images.length > 1 ? (e) => {
                            e.stopPropagation();
                            setLightboxImages(images);
                            setLightboxIndex(heroIndex % images.length);
                          } : undefined}
                        >
                          {heroImg ? (
                            <Image
                              src={activeImg?.src || heroImg.src}
                              alt={activeImg?.alt || heroImg.alt}
                              fill
                              className="object-cover"
                              loading="lazy"
                              sizes="(max-width: 640px) 112px, 144px"
                            />
                          ) : (
                            <div className="w-full aspect-square flex items-center justify-center text-gray-300">
                              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
                            </div>
                          )}
                        </div>
                        {/* Details on right */}
                        <div className="flex-1 p-3 sm:p-4 flex flex-col justify-center min-h-[112px] sm:min-h-[144px]">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                            <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-medium ${
                              set.tier === 'premium-plus'
                                ? 'bg-green-800 text-white'
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {set.tier === 'premium-plus' ? t('set.tierPremiumPlus') : t('set.tierPremium')}
                            </span>
                            <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-medium ${
                              set.gender === 'mens'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-pink-50 text-pink-700'
                            }`}>
                              {set.gender === 'mens' ? t('set.genderMens') : t('set.genderWomens')}
                            </span>
                            {!isAvailable && (
                              <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                                {t('set.unavailable')}
                              </span>
                            )}
                          </div>
                          <h3 className="font-semibold text-gray-900 text-sm sm:text-base leading-tight">{set.name}</h3>
                          {set.brand && (
                            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{set.brand} {set.model || ''}</p>
                          )}
                          {set.specifications && set.specifications.length > 0 && (
                            <p className="text-[10px] sm:text-xs text-gray-400 mt-1 line-clamp-2">
                              {(set.specifications as string[]).join(' · ')}
                            </p>
                          )}
                          {durationDays > 0 && (() => {
                            const bd = getCoursePriceBreakdown(set, durationDays);
                            return (
                              <div className="mt-1">
                                <p className="text-sm font-bold text-green-700">
                                  ฿{format.number(bd.total)}
                                </p>
                                {bd.savings > 0 && (
                                  <p className="text-[10px] text-green-600 font-medium">
                                    {t('set.savings', { amount: format.number(bd.savings) })}
                                  </p>
                                )}
                                <p className="text-[10px] text-gray-400">
                                  {bd.packs.map(p => p.label).join(' + ')}
                                </p>
                              </div>
                            );
                          })()}
                          {isSelected && (
                            <div className="mt-1.5">
                              <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                                <CheckIcon className="w-3.5 h-3.5" /> {t('set.selected')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Thumbnail carousel for selected set with multiple images */}
                    {isSelected && images.length > 1 && (
                      <div className="flex gap-1.5 overflow-x-auto pb-1 pl-1">
                        {images.map((img, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setHeroIndex(i)}
                            className={`flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden border-2 transition-all ${
                              heroIndex % images.length === i
                                ? 'border-green-600 shadow-sm'
                                : 'border-gray-200 opacity-50 hover:opacity-100'
                            }`}
                          >
                            <Image src={img.src} alt={img.alt} width={56} height={56} className="w-full h-full object-cover" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            <a
              href="https://www.len.golf/golf-course-club-rental/"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-sm text-green-700 hover:text-green-800 underline underline-offset-2"
            >
              {t('set.fullDetailsLink')}
            </a>

            <button
              onClick={goNext}
              disabled={!selectedSet}
              className="w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {t('set.continue')}
            </button>
          </div>
        )}

        {/* Step 1: Dates & Duration */}
        {step === 'dates' && (
          <div className="space-y-6">
            {/* Date pickers */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('dates.startDateLabel')}</label>
                <input
                  type="date"
                  value={startDate}
                  min={todayStr}
                  onChange={e => {
                    setStartDate(e.target.value);
                    if (endDate && e.target.value > endDate) setEndDate('');
                    setSelectedSet(null);
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('dates.endDateLabel')}</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || todayStr}
                  disabled={!startDate}
                  onChange={e => {
                    setEndDate(e.target.value);
                    setSelectedSet(null);
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Time pickers */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('dates.pickupTimeLabel')} <span className="text-red-500">*</span></label>
                <select
                  value={pickupTime}
                  onChange={e => {
                    setPickupTime(e.target.value);
                    if (!returnTime) setReturnTime(e.target.value);
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900"
                >
                  <option value="">{t('dates.timeSelectPlaceholder')}</option>
                  {TIME_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('dates.returnTimeLabel')} <span className="text-red-500">*</span></label>
                <select
                  value={returnTime}
                  onChange={e => setReturnTime(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900"
                >
                  <option value="">{t('dates.timeSelectPlaceholder')}</option>
                  {TIME_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </div>

            {/* Collapsible pricing guide — matches len.golf styling */}
            <details className="group">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                {t('dates.pricingGuideToggle')}
              </summary>
              <div className="mt-3 overflow-hidden rounded-xl border border-gray-200/60">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-[#1B5E20] text-white">
                      <th className="px-5 py-3 text-sm font-semibold">{t('dates.pricingTable.durationHeader')}</th>
                      <th className="px-5 py-3 text-sm font-semibold text-center">{t('dates.pricingTable.premiumHeader')}</th>
                      <th className="px-5 py-3 text-sm font-semibold text-center">{t('dates.pricingTable.premiumPlusHeader')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white">
                      <td className="px-5 py-4 text-sm font-medium text-gray-900">{t('dates.pricingTable.oneDay')}</td>
                      <td className="px-5 py-4 text-sm font-bold text-center" style={{ color: '#007429' }}>1,200 THB</td>
                      <td className="px-5 py-4 text-sm font-bold text-center" style={{ color: '#007429' }}>1,800 THB</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-5 py-4">
                        <span className="text-sm font-medium text-gray-900">{t('dates.pricingTable.threeDays')}</span>
                        <span className="ml-2 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{t('dates.pricingTable.offerPay2Get1')}</span>
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-center" style={{ color: '#007429' }}>2,400 THB</td>
                      <td className="px-5 py-4 text-sm font-bold text-center" style={{ color: '#007429' }}>3,600 THB</td>
                    </tr>
                    <tr className="bg-white">
                      <td className="px-5 py-4">
                        <span className="text-sm font-medium text-gray-900">{t('dates.pricingTable.sevenDays')}</span>
                        <span className="ml-2 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{t('dates.pricingTable.offerPay4Get3')}</span>
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-center" style={{ color: '#007429' }}>4,800 THB</td>
                      <td className="px-5 py-4 text-sm font-bold text-center" style={{ color: '#007429' }}>7,200 THB</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-5 py-4">
                        <span className="text-sm font-medium text-gray-900">{t('dates.pricingTable.fourteenDays')}</span>
                        <span className="ml-2 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{t('dates.pricingTable.offerPay7Get7')}</span>
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-center" style={{ color: '#007429' }}>8,400 THB</td>
                      <td className="px-5 py-4 text-sm font-bold text-center" style={{ color: '#007429' }}>12,600 THB</td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-xs text-gray-400 italic px-5 py-2.5">
                  {t('dates.pricingTable.footnote')}
                </p>
              </div>
            </details>

            {/* FYI strip - shows the sets that can be rented. Availability is checked on Step 2. */}
            <div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
                <InformationCircleIcon className="w-3.5 h-3.5" />
                <span>{t('dates.preview.label')}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {PREVIEW_SETS.map((s) => (
                  <div key={s.name} className="flex flex-col items-center">
                    <div className="relative h-16 sm:h-20 w-full bg-white rounded-lg border border-gray-100 flex items-center justify-center overflow-hidden">
                      <Image
                        src={s.img}
                        alt={s.name}
                        fill
                        className="object-contain p-1"
                        loading="lazy"
                        sizes="(max-width: 640px) 33vw, 200px"
                      />
                    </div>
                    <div className="text-center mt-1.5">
                      <div className="text-[10px] sm:text-[11px] font-medium text-gray-700 leading-tight">{s.name}</div>
                      <div className="text-[9px] sm:text-[10px] text-gray-400">{t(`dates.preview.${s.metaKey}`)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-2 text-center">
                {t('dates.preview.helper')}
              </p>
            </div>

            <button
              onClick={goNext}
              disabled={!startDate || !endDate || !pickupTime || !returnTime}
              className="w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {t('dates.continue')}
            </button>
          </div>
        )}

        {/* Step 3: Delivery & Add-ons */}
        {step === 'delivery' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">{t('delivery.methodLabel')}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDeliveryRequested(false)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    !deliveryRequested
                      ? 'border-green-600 bg-green-50'
                      : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <MapPinIcon className="h-6 w-6 text-green-600 mb-2" />
                  <p className="font-semibold text-gray-900">{t('delivery.pickupTitle')}</p>
                  <p className="text-xs text-gray-500 mt-1">{t('delivery.pickupAddress')}</p>
                  <p className="text-sm font-bold text-green-700 mt-2">{t('delivery.pickupPriceFree')}</p>
                </button>
                <button
                  type="button"
                  onClick={() => { setDeliveryRequested(true); setPaymentMethod('card'); }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    deliveryRequested
                      ? 'border-green-600 bg-green-50'
                      : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <TruckIcon className="h-6 w-6 text-green-600 mb-2" />
                  <p className="font-semibold text-gray-900">{t('delivery.deliveryTitle')}</p>
                  <p className="text-xs text-gray-500 mt-1">{t('delivery.deliveryDescription')}</p>
                  <p className="text-sm font-bold text-green-700 mt-2">{t('delivery.deliveryPrice')}</p>
                </button>
              </div>
            </div>

            {deliveryRequested && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('delivery.addressLabel')} <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={deliveryAddress}
                    onChange={e => setDeliveryAddress(e.target.value)}
                    placeholder={t('delivery.addressPlaceholder')}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900 placeholder:text-gray-400"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">{t('delivery.addOnsLabel')}</label>
              <div className="space-y-3">
                {GEAR_UP_ITEMS.filter(item => item.id !== 'delivery').map(item => {
                  const isSelected = addOns.some(a => a.key === item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleAddOn(item.id, item.name, item.price)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center justify-between ${
                        isSelected
                          ? 'border-green-600 bg-green-50'
                          : 'border-gray-200 hover:border-green-300'
                      }`}
                    >
                      <div>
                        <p className="font-medium text-gray-900">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-gray-500">{item.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-bold text-green-700">฿{format.number(item.price)}</p>
                        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-green-600 border-green-600' : 'border-gray-300'
                        }`}>
                          {isSelected && <CheckIcon className="h-4 w-4 text-white stroke-[3]" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Payment method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">{t('delivery.paymentLabel')}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {!deliveryRequested && (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      paymentMethod === 'cash'
                        ? 'border-green-600 bg-green-50'
                        : 'border-gray-200 hover:border-green-300'
                    }`}
                  >
                    <p className="font-semibold text-gray-900">{t('delivery.paymentCashTitle')}</p>
                    <p className="text-xs text-gray-500 mt-1">{t('delivery.paymentCashHint')}</p>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    paymentMethod === 'card'
                      ? 'border-green-600 bg-green-50'
                      : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <p className="font-semibold text-gray-900">{t('delivery.paymentLinkTitle')}</p>
                  <p className="text-xs text-gray-500 mt-1">{t('delivery.paymentLinkHint')}</p>
                </button>
              </div>
            </div>

            {deliveryRequested && !deliveryAddress.trim() && (
              <p className="text-sm text-amber-600 text-center">{t('delivery.addressRequiredHint')}</p>
            )}

            <button
              onClick={goNext}
              disabled={deliveryRequested && !deliveryAddress.trim()}
              className="w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {t('delivery.continue')}
            </button>
          </div>
        )}

        {/* Step 4: Contact Details */}
        {step === 'contact' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('contact.nameLabel')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder={t('contact.namePlaceholder')}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('contact.phoneLabel')} <span className="text-red-500">*</span>
              </label>
              <PhoneInput
                international
                defaultCountry="TH"
                placeholder={t('contact.phonePlaceholder')}
                value={contactPhone}
                onChange={setContactPhone}
                aria-invalid={!!contactPhone && !isValidPhoneNumber(contactPhone)}
                aria-describedby="course-rental-phone-hint"
                className={`w-full h-12 px-3 py-2 rounded-xl border custom-phone-input focus:ring-1 focus:ring-green-500 ${
                  contactPhone && isValidPhoneNumber(contactPhone)
                    ? 'border-green-500 focus:border-green-500'
                    : 'border-gray-300 focus:border-green-500'
                }`}
              />
              {!contactPhone && (
                <p id="course-rental-phone-hint" className="mt-1 text-xs text-gray-500">
                  {t('contact.phoneCountryHelper')}
                </p>
              )}
              {contactPhone && !isValidPhoneNumber(contactPhone) && (
                <p id="course-rental-phone-hint" className="mt-1 text-xs text-red-600" role="alert">
                  {t('contact.phoneInvalid')}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('contact.emailLabel')} <span className="text-gray-400 text-xs font-normal">{t('contact.emailHint')}</span>
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                placeholder={t('contact.emailPlaceholder')}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('contact.notesLabel')}</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t('contact.notesPlaceholder')}
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('contact.preferredContactLabel')}</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'line' as const, labelKey: 'preferredContactLine' as const },
                  { key: 'email' as const, labelKey: 'preferredContactEmail' as const },
                  { key: 'whatsapp' as const, labelKey: 'preferredContactWhatsApp' as const },
                ]).map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPreferredContact(opt.key)}
                    className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                      preferredContact === opt.key
                        ? 'border-green-600 bg-green-50 text-green-800'
                        : 'border-gray-200 text-gray-600 hover:border-green-300'
                    }`}
                  >
                    {t(`contact.${opt.labelKey}`)}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={goNext}
              disabled={!contactName.trim() || !contactPhone || !isValidPhoneNumber(contactPhone)}
              className="w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {t('contact.reviewBooking')}
            </button>
          </div>
        )}

        {/* Step 5: Review & Confirm */}
        {step === 'review' && selectedSet && (
          <div className="space-y-5">
            {/* Club set */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-500 mb-2">{t('review.clubSetHeading')}</h3>
              <p className="font-semibold text-gray-900">{selectedSet.name}</p>
              <div className="flex gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  selectedSet.tier === 'premium-plus' ? 'bg-green-800 text-white' : 'bg-green-100 text-green-800'
                }`}>
                  {selectedSet.tier === 'premium-plus' ? t('review.tierPremiumPlus') : t('review.tierPremium')}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  selectedSet.gender === 'mens'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-pink-50 text-pink-700'
                }`}>
                  {selectedSet.gender === 'mens' ? t('review.genderMens') : t('review.genderWomens')}
                </span>
              </div>
            </div>

            {/* Dates */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-500 mb-2">{t('review.rentalPeriodHeading')}</h3>
              <p className="font-semibold text-gray-900">
                {format.dateTime(new Date(`${startDate}T00:00:00+07:00`), { timeZone: 'Asia/Bangkok', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                {pickupTime && ` ${pickupTime}`}
                {' '}&rarr;{' '}
                {format.dateTime(new Date(`${endDate}T00:00:00+07:00`), { timeZone: 'Asia/Bangkok', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                {returnTime && ` ${returnTime}`}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {t('review.daysCount', { count: durationDays })}
              </p>
            </div>

            {/* Delivery */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                {deliveryRequested ? t('review.deliveryHeading') : t('review.pickupHeading')}
              </h3>
              {deliveryRequested ? (
                <>
                  <p className="font-semibold text-gray-900">{t('review.deliveryTitle')}</p>
                  <p className="text-sm text-gray-500 mt-1">{deliveryAddress}</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-gray-900">{t('review.pickupTitle')}</p>
                  <p className="text-sm text-gray-500 mt-1">{t('review.pickupAddress')}</p>
                </>
              )}
              {(pickupTime || returnTime) && (
                <p className="text-sm text-gray-500 mt-1">
                  {deliveryRequested
                    ? t('review.deliveryTimeSummary', { delivery: pickupTime, return: returnTime })
                    : t('review.pickupTimeSummary', { pickup: pickupTime, return: returnTime })}
                </p>
              )}
            </div>

            {/* Add-ons */}
            {addOns.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-medium text-gray-500 mb-2">{t('review.addOnsHeading')}</h3>
                {addOns.map(a => (
                  <div key={a.key} className="flex justify-between text-sm">
                    <span className="text-gray-900">{a.label}</span>
                    <span className="text-gray-600">฿{format.number(a.price)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Contact */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-500 mb-2">{t('review.contactHeading')}</h3>
              <p className="font-semibold text-gray-900">{contactName}</p>
              <p className="text-sm text-gray-500">{contactPhone}</p>
              {contactEmail && <p className="text-sm text-gray-500">{contactEmail}</p>}
              <p className="text-sm text-gray-500 mt-1">
                {t('review.preferredContact', {
                  method: preferredContact === 'line'
                    ? t('contact.preferredContactLine')
                    : preferredContact === 'email'
                    ? t('contact.preferredContactEmail')
                    : t('contact.preferredContactWhatsApp'),
                })}
              </p>
              {notes && <p className="text-sm text-gray-400 mt-1 italic">{notes}</p>}
            </div>

            {/* Pricing breakdown */}
            <div className="bg-green-50 rounded-xl border border-green-200 p-4">
              <h3 className="text-sm font-medium text-green-800 mb-3">{t('review.pricingHeading')}</h3>
              <div className="space-y-1 text-sm">
                {breakdown && breakdown.packs.map((pack, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-gray-700">{pack.label}</span>
                    <span className="text-gray-900">฿{format.number(pack.price)}</span>
                  </div>
                ))}
                {deliveryRequested && (
                  <div className="flex justify-between">
                    <span className="text-gray-700">{t('review.deliveryAndReturn')}</span>
                    <span className="text-gray-900">฿{format.number(deliveryFee)}</span>
                  </div>
                )}
                {addOns.map(a => (
                  <div key={a.key} className="flex justify-between">
                    <span className="text-gray-700">{a.label}</span>
                    <span className="text-gray-900">฿{format.number(a.price)}</span>
                  </div>
                ))}
                {breakdown && breakdown.savings > 0 && (
                  <div className="flex justify-between text-green-600 text-xs">
                    <span>{t('review.savings', { amount: format.number(breakdown.savings) })}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-green-300 font-bold text-base">
                  <span className="text-green-800">{t('review.totalLabel')}</span>
                  <span className="text-green-800">฿{format.number(totalPrice)}</span>
                </div>
              </div>
            </div>

            {/* Payment info */}
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-sm text-blue-800">
              <p className="font-medium mb-1">{t('review.paymentHeading')}</p>
              {paymentMethod === 'cash' ? (
                <p>{t('review.paymentCashBody')}</p>
              ) : (
                <p>{t('review.paymentLinkBody')}</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('review.submitting')}
                </>
              ) : (
                t('review.confirmReservation')
              )}
            </button>
          </div>
        )}

        {/* Confirmation */}
        {isConfirmation && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckIcon className="h-8 w-8 text-green-600" />
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-1">{t('confirmation.rentalCodeLabel')}</p>
              <p className="text-2xl font-bold text-green-700 font-mono tracking-wider">{rentalCode}</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 text-left space-y-3">
              <div>
                <p className="text-xs text-gray-500">{t('confirmation.clubSetLabel')}</p>
                <p className="font-semibold text-gray-900">{selectedSet?.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{t('confirmation.datesLabel')}</p>
                <p className="font-medium text-gray-900">
                  {format.dateTime(new Date(`${startDate}T00:00:00+07:00`), { timeZone: 'Asia/Bangkok', month: 'short', day: 'numeric' })}
                  {' → '}
                  {format.dateTime(new Date(`${endDate}T00:00:00+07:00`), { timeZone: 'Asia/Bangkok', month: 'short', day: 'numeric' })}
                  {' '}{t('confirmation.daysSuffix', { count: durationDays })}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{deliveryRequested ? t('confirmation.deliveryHeading') : t('confirmation.pickupHeading')}</p>
                <p className="font-medium text-gray-900">
                  {deliveryRequested ? deliveryAddress : t('confirmation.pickupAddressShort')}
                </p>
                {(pickupTime || returnTime) && (
                  <p className="text-sm text-gray-500">
                    {deliveryRequested
                      ? t('confirmation.deliveryTimeSummary', { delivery: pickupTime, return: returnTime })
                      : t('confirmation.pickupTimeSummary', { pickup: pickupTime, return: returnTime })}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500">{t('confirmation.paymentHeading')}</p>
                <p className="font-medium text-gray-900">
                  {paymentMethod === 'cash' ? t('confirmation.paymentCash') : t('confirmation.paymentLink')}
                </p>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500">{t('confirmation.totalLabel')}</p>
                <p className="text-xl font-bold text-green-700">฿{format.number(totalPrice)}</p>
              </div>
            </div>

            <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
              <p className="font-medium mb-1">{t('confirmation.nextHeading')}</p>
              {paymentMethod === 'cash' ? (
                <p>{t('confirmation.nextCashBody')}</p>
              ) : (
                <p>{t('confirmation.nextLinkBody')}</p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href="https://lin.ee/uxQpIXn"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-[#06C755] text-white px-4 py-3 rounded-xl font-medium hover:bg-[#05b04e] transition-colors"
              >
                <FaLine className="text-xl" />
                {t('confirmation.contactLineCta')}
              </a>
              <a
                href="tel:0966682335"
                className="flex-1 flex items-center justify-center gap-2 bg-gray-600 text-white px-4 py-3 rounded-xl font-medium hover:bg-gray-700 transition-colors"
              >
                <PhoneIcon className="h-5 w-5" />
                {t('confirmation.callCta')}
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxImages && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center"
          onClick={() => setLightboxImages(null)}
        >
          <button
            onClick={() => setLightboxImages(null)}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 z-10"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-xs sm:text-sm font-medium">
            {t('lightbox.indexCounter', { current: lightboxIndex + 1, total: lightboxImages.length })}
          </div>

          <div className="flex-1 flex items-center justify-center w-full px-12 sm:px-20" onClick={e => e.stopPropagation()}>
            <Image
              src={lightboxImages[lightboxIndex].src}
              alt={lightboxImages[lightboxIndex].alt}
              width={800}
              height={600}
              className="max-w-full max-h-[70vh] object-contain"
              unoptimized
            />
          </div>

          <div className="text-white/80 text-xs sm:text-sm mb-2">{lightboxImages[lightboxIndex].alt}</div>

          {lightboxImages.length > 1 && (
            <>
              <button
                onClick={e => { e.stopPropagation(); setLightboxIndex((lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length); }}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 sm:p-3"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={e => { e.stopPropagation(); setLightboxIndex((lightboxIndex + 1) % lightboxImages.length); }}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 sm:p-3"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <div className="flex gap-1.5 pb-4 pt-2 overflow-x-auto max-w-[90vw]" onClick={e => e.stopPropagation()}>
                {lightboxImages.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded overflow-hidden border-2 transition-colors ${
                      i === lightboxIndex ? 'border-white' : 'border-transparent opacity-50 hover:opacity-80'
                    }`}
                  >
                    <Image src={img.src} alt={img.alt} width={48} height={48} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Layout>
  );
}
