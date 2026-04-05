'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Layout } from '@/app/(features)/bookings/components/booking/Layout';
import { ArrowLeftIcon, CheckIcon, MapPinIcon, TruckIcon, PhoneIcon } from '@heroicons/react/24/outline';
import { FaLine } from 'react-icons/fa';
import type { RentalClubSetWithAvailability, ClubRentalAddOn } from '@/types/golf-club-rental';
import { getCoursePriceBreakdown, getGearUpItems } from '@/types/golf-club-rental';
import { usePricingLoader } from '@/lib/pricing';
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

const TIME_OPTIONS = [
  '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
  '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
  '21:00', '22:00',
];

type Step = 'dates' | 'set' | 'delivery' | 'contact' | 'review' | 'confirmation';

const STEP_ORDER: Step[] = ['dates', 'set', 'delivery', 'contact', 'review'];

const STEP_LABELS: Record<Step, string> = {
  dates: 'Dates & Duration',
  set: 'Select Clubs',
  delivery: 'Delivery & Add-ons',
  contact: 'Your Details',
  review: 'Review & Confirm',
  confirmation: 'Confirmed',
};

export default function CourseRentalPage() {
  usePricingLoader();
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
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');

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
            `Payment: ${paymentMethod === 'cash' ? 'Cash (at LENGOLF)' : 'Payment link (credit/debit card or Shopee wallet)'}`,
            notes,
          ].filter(Boolean).join('\n') || undefined,
          source: 'website' as const,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create reservation');
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

      setStep('confirmation');
    } catch {
      setError('Something went wrong. Please try again.');
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
              aria-label="Go back"
            >
              <ArrowLeftIcon className="h-6 w-6 text-gray-600" />
            </button>
          )}
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {isConfirmation ? 'Booking Confirmed!' : STEP_LABELS[step]}
            </h2>
            <p className="text-gray-600 mt-1 text-sm">
              {step === 'dates' && 'Select your rental dates and times.'}
              {step === 'set' && 'Choose which premium club set to rent for the golf course.'}
              {step === 'delivery' && 'Choose pickup or delivery, and optional add-ons.'}
              {step === 'contact' && 'We need your details to confirm the reservation.'}
              {step === 'review' && 'Review your rental details before confirming.'}
              {isConfirmation && 'Your club rental reservation has been submitted.'}
            </p>
          </div>
        </div>

        {/* Step 2: Set Selection */}
        {step === 'set' && (
          <div className="space-y-4">
            {/* Selected dates summary */}
            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between text-sm">
              <span className="text-gray-600">
                {durationDays} {durationDays === 1 ? 'day' : 'days'}
                <span className="mx-1.5">&middot;</span>
                {new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                {' '}-{' '}
                {new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
              </span>
            </div>

            {setsLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : availableSets.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg font-medium mb-2">No club sets available</p>
                <p className="text-sm">Please try different dates or contact us directly.</p>
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
                          className={`w-28 sm:w-36 flex-shrink-0 bg-gray-50 flex items-center justify-center ${heroImg ? '' : 'bg-gray-100'} ${isSelected && images.length > 1 ? 'cursor-zoom-in' : ''}`}
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
                              {set.tier === 'premium-plus' ? 'Premium+' : 'Premium'}
                            </span>
                            <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-medium ${
                              set.gender === 'mens'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-pink-50 text-pink-700'
                            }`}>
                              {set.gender === 'mens' ? "Men's" : "Women's"}
                            </span>
                            {!isAvailable && (
                              <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                                Unavailable
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
                                  ฿{bd.total.toLocaleString('en-US')}
                                </p>
                                {bd.savings > 0 && (
                                  <p className="text-[10px] text-green-600 font-medium">
                                    Save ฿{bd.savings.toLocaleString('en-US')} vs daily rate
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
                                <CheckIcon className="w-3.5 h-3.5" /> Selected
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
              View full club details on len.golf
            </a>

            <button
              onClick={goNext}
              disabled={!selectedSet}
              className="w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 1: Dates & Duration */}
        {step === 'dates' && (
          <div className="space-y-6">
            {/* Date pickers */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Pickup Time <span className="text-red-500">*</span></label>
                <select
                  value={pickupTime}
                  onChange={e => {
                    setPickupTime(e.target.value);
                    if (!returnTime) setReturnTime(e.target.value);
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900"
                >
                  <option value="">Select</option>
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Return Time <span className="text-red-500">*</span></label>
                <select
                  value={returnTime}
                  onChange={e => setReturnTime(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900"
                >
                  <option value="">Select</option>
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Collapsible pricing guide — matches len.golf styling */}
            <details className="group">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                View pricing guide
              </summary>
              <div className="mt-3 overflow-hidden rounded-xl border border-gray-200/60">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-[#1B5E20] text-white">
                      <th className="px-5 py-3 text-sm font-semibold">Duration</th>
                      <th className="px-5 py-3 text-sm font-semibold text-center">Premium</th>
                      <th className="px-5 py-3 text-sm font-semibold text-center">Premium+</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white">
                      <td className="px-5 py-4 text-sm font-medium text-gray-900">1 Day</td>
                      <td className="px-5 py-4 text-sm font-bold text-center" style={{ color: '#007429' }}>1,200 THB</td>
                      <td className="px-5 py-4 text-sm font-bold text-center" style={{ color: '#007429' }}>1,800 THB</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-5 py-4">
                        <span className="text-sm font-medium text-gray-900">3 Days</span>
                        <span className="ml-2 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Pay 2, get 1 free</span>
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-center" style={{ color: '#007429' }}>2,400 THB</td>
                      <td className="px-5 py-4 text-sm font-bold text-center" style={{ color: '#007429' }}>3,600 THB</td>
                    </tr>
                    <tr className="bg-white">
                      <td className="px-5 py-4">
                        <span className="text-sm font-medium text-gray-900">7 Days</span>
                        <span className="ml-2 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Pay 4, get 3 free</span>
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-center" style={{ color: '#007429' }}>4,800 THB</td>
                      <td className="px-5 py-4 text-sm font-bold text-center" style={{ color: '#007429' }}>7,200 THB</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-5 py-4">
                        <span className="text-sm font-medium text-gray-900">14 Days</span>
                        <span className="ml-2 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Pay 7, get 7 free</span>
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-center" style={{ color: '#007429' }}>8,400 THB</td>
                      <td className="px-5 py-4 text-sm font-bold text-center" style={{ color: '#007429' }}>12,600 THB</td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-xs text-gray-400 italic px-5 py-2.5">
                  For other durations, we automatically find the best price combination.
                </p>
              </div>
            </details>

            <button
              onClick={goNext}
              disabled={!startDate || !endDate || !pickupTime || !returnTime}
              className="w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 3: Delivery & Add-ons */}
        {step === 'delivery' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">How would you like to get the clubs?</label>
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
                  <p className="font-semibold text-gray-900">Pickup at LENGOLF</p>
                  <p className="text-xs text-gray-500 mt-1">Mercury Ville @ BTS Chidlom, Floor 4</p>
                  <p className="text-sm font-bold text-green-700 mt-2">Free</p>
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
                  <p className="font-semibold text-gray-900">Delivery & Return</p>
                  <p className="text-xs text-gray-500 mt-1">Delivered to your hotel or location in Bangkok</p>
                  <p className="text-sm font-bold text-green-700 mt-2">฿500</p>
                </button>
              </div>
            </div>

            {deliveryRequested && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Delivery Address <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={deliveryAddress}
                    onChange={e => setDeliveryAddress(e.target.value)}
                    placeholder="Hotel name, street address, district..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900 placeholder:text-gray-400"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Optional Add-ons</label>
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
                        <p className="text-sm font-bold text-green-700">฿{item.price.toLocaleString('en-US')}</p>
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
              <label className="block text-sm font-medium text-gray-700 mb-3">Payment Method</label>
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
                    <p className="font-semibold text-gray-900">Cash</p>
                    <p className="text-xs text-gray-500 mt-1">Pay when you pick up at LENGOLF</p>
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
                  <p className="font-semibold text-gray-900">Payment Link</p>
                  <p className="text-xs text-gray-500 mt-1">We&apos;ll send a payment link via LINE</p>
                </button>
              </div>
            </div>

            <button
              onClick={goNext}
              disabled={deliveryRequested && !deliveryAddress.trim()}
              className="w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 4: Contact Details */}
        {step === 'contact' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="Your full name"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={contactPhone}
                onChange={e => setContactPhone(e.target.value)}
                placeholder="e.g. 096-668-2335"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email <span className="text-gray-400 text-xs font-normal">(for confirmation)</span>
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any special requests (left-handed, specific clubs needed, etc.)"
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <button
              onClick={goNext}
              disabled={!contactName.trim() || !contactPhone.trim()}
              className="w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Review Booking
            </button>
          </div>
        )}

        {/* Step 5: Review & Confirm */}
        {step === 'review' && selectedSet && (
          <div className="space-y-5">
            {/* Club set */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Club Set</h3>
              <p className="font-semibold text-gray-900">{selectedSet.name}</p>
              <div className="flex gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  selectedSet.tier === 'premium-plus' ? 'bg-green-800 text-white' : 'bg-green-100 text-green-800'
                }`}>
                  {selectedSet.tier === 'premium-plus' ? 'Premium+' : 'Premium'}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  selectedSet.gender === 'mens'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-pink-50 text-pink-700'
                }`}>
                  {selectedSet.gender === 'mens' ? "Men's" : "Women's"}
                </span>
              </div>
            </div>

            {/* Dates */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Rental Period</h3>
              <p className="font-semibold text-gray-900">
                {new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                {pickupTime && ` ${pickupTime}`}
                {' '}&rarr;{' '}
                {new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                {returnTime && ` ${returnTime}`}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {durationDays} {durationDays === 1 ? 'day' : 'days'}
              </p>
            </div>

            {/* Delivery */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                {deliveryRequested ? 'Delivery' : 'Pickup'}
              </h3>
              {deliveryRequested ? (
                <>
                  <p className="font-semibold text-gray-900">Delivery & Return</p>
                  <p className="text-sm text-gray-500 mt-1">{deliveryAddress}</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-gray-900">Pickup at LENGOLF</p>
                  <p className="text-sm text-gray-500 mt-1">Mercury Ville @ BTS Chidlom, Floor 4</p>
                </>
              )}
              {(pickupTime || returnTime) && (
                <p className="text-sm text-gray-500 mt-1">
                  {deliveryRequested ? 'Delivery' : 'Pickup'}: {pickupTime} · Return: {returnTime}
                </p>
              )}
            </div>

            {/* Add-ons */}
            {addOns.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Add-ons</h3>
                {addOns.map(a => (
                  <div key={a.key} className="flex justify-between text-sm">
                    <span className="text-gray-900">{a.label}</span>
                    <span className="text-gray-600">฿{a.price.toLocaleString('en-US')}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Contact */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Contact</h3>
              <p className="font-semibold text-gray-900">{contactName}</p>
              <p className="text-sm text-gray-500">{contactPhone}</p>
              {contactEmail && <p className="text-sm text-gray-500">{contactEmail}</p>}
              {notes && <p className="text-sm text-gray-400 mt-1 italic">{notes}</p>}
            </div>

            {/* Pricing breakdown */}
            <div className="bg-green-50 rounded-xl border border-green-200 p-4">
              <h3 className="text-sm font-medium text-green-800 mb-3">Pricing</h3>
              <div className="space-y-1 text-sm">
                {breakdown && breakdown.packs.map((pack, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-gray-700">{pack.label}</span>
                    <span className="text-gray-900">฿{pack.price.toLocaleString('en-US')}</span>
                  </div>
                ))}
                {deliveryRequested && (
                  <div className="flex justify-between">
                    <span className="text-gray-700">Delivery & return</span>
                    <span className="text-gray-900">฿{deliveryFee.toLocaleString('en-US')}</span>
                  </div>
                )}
                {addOns.map(a => (
                  <div key={a.key} className="flex justify-between">
                    <span className="text-gray-700">{a.label}</span>
                    <span className="text-gray-900">฿{a.price.toLocaleString('en-US')}</span>
                  </div>
                ))}
                {breakdown && breakdown.savings > 0 && (
                  <div className="flex justify-between text-green-600 text-xs">
                    <span>You save ฿{breakdown.savings.toLocaleString('en-US')} vs daily rate</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-green-300 font-bold text-base">
                  <span className="text-green-800">Total</span>
                  <span className="text-green-800">฿{totalPrice.toLocaleString('en-US')}</span>
                </div>
              </div>
            </div>

            {/* Payment info */}
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-sm text-blue-800">
              <p className="font-medium mb-1">Payment</p>
              {paymentMethod === 'cash' ? (
                <p>Pay with cash when you pick up the clubs at LENGOLF.</p>
              ) : (
                <p>Our team will send you a payment link via LINE within 2 hours. You can pay by credit/debit card or Shopee wallet.</p>
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
                  Submitting...
                </>
              ) : (
                'Confirm Reservation'
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
              <p className="text-sm text-gray-500 mb-1">Your rental code</p>
              <p className="text-2xl font-bold text-green-700 font-mono tracking-wider">{rentalCode}</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 text-left space-y-3">
              <div>
                <p className="text-xs text-gray-500">Club Set</p>
                <p className="font-semibold text-gray-900">{selectedSet?.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Dates</p>
                <p className="font-medium text-gray-900">
                  {new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' → '}
                  {new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' '}({durationDays}d)
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{deliveryRequested ? 'Delivery' : 'Pickup'}</p>
                <p className="font-medium text-gray-900">
                  {deliveryRequested ? deliveryAddress : 'LENGOLF, Mercury Ville, Chidlom'}
                </p>
                {(pickupTime || returnTime) && (
                  <p className="text-sm text-gray-500">
                    {deliveryRequested ? 'Delivery' : 'Pickup'}: {pickupTime} · Return: {returnTime}
                  </p>
                )}
              </div>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500">Total</p>
                <p className="text-xl font-bold text-green-700">฿{totalPrice.toLocaleString('en-US')}</p>
              </div>
            </div>

            <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
              <p className="font-medium mb-1">What happens next?</p>
              <p>Our team will contact you within 2 hours via LINE to confirm your reservation and send a payment link.</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href="https://lin.ee/uxQpIXn"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-[#06C755] text-white px-4 py-3 rounded-xl font-medium hover:bg-[#05b04e] transition-colors"
              >
                <FaLine className="text-xl" />
                Contact via LINE
              </a>
              <a
                href="tel:0966682335"
                className="flex-1 flex items-center justify-center gap-2 bg-gray-600 text-white px-4 py-3 rounded-xl font-medium hover:bg-gray-700 transition-colors"
              >
                <PhoneIcon className="h-5 w-5" />
                Call 096-668-2335
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
            {lightboxIndex + 1} / {lightboxImages.length}
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
