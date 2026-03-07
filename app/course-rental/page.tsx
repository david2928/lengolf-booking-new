'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Layout } from '@/app/(features)/bookings/components/booking/Layout';
import { ArrowLeftIcon, CheckIcon, MapPinIcon, TruckIcon, PhoneIcon } from '@heroicons/react/24/outline';
import { FaLine } from 'react-icons/fa';
import type { RentalClubSetWithAvailability, ClubRentalAddOn } from '@/types/golf-club-rental';
import { getCoursePrice, GEAR_UP_ITEMS } from '@/types/golf-club-rental';
import { pushEventToGtm } from '@/utils/gtm';

const STORAGE_BASE = 'https://bisimqmtxjsptehhqpeg.supabase.co/storage/v1/object/public/website-assets';

const HERO_IMAGES = [
  { src: `${STORAGE_BASE}/clubs/premium-plus/2.png`, alt: 'Callaway Paradym full set' },
  { src: `${STORAGE_BASE}/clubs/premium-plus/4.png`, alt: 'Callaway Paradym driver' },
  { src: `${STORAGE_BASE}/clubs/premium-plus/11.png`, alt: 'Callaway Paradym irons' },
  { src: `${STORAGE_BASE}/clubs/premium-plus/15.png`, alt: 'Odyssey putter' },
  { src: `${STORAGE_BASE}/clubs/premium-plus/7.png`, alt: 'Callaway Paradym woods' },
];

const DURATION_OPTIONS = [
  { days: 1, label: '1 Day', description: 'Single round' },
  { days: 3, label: '3 Days', description: 'Weekend trip' },
  { days: 7, label: '7 Days', description: 'Full week' },
  { days: 14, label: '14 Days', description: 'Extended stay' },
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
  const [step, setStep] = useState<Step>('dates');
  const [availableSets, setAvailableSets] = useState<RentalClubSetWithAvailability[]>([]);
  const [setsLoading, setSetsLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);

  // Selections
  const [selectedSet, setSelectedSet] = useState<RentalClubSetWithAvailability | null>(null);
  const [startDate, setStartDate] = useState('');
  const [durationDays, setDurationDays] = useState(1);
  const [deliveryRequested, setDeliveryRequested] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [addOns, setAddOns] = useState<ClubRentalAddOn[]>([]);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [rentalCode, setRentalCode] = useState('');
  const [error, setError] = useState('');

  // Calculate dates: "1 day" rental means return next day, so end = start + duration
  const endDate = startDate
    ? (() => {
        const d = new Date(startDate);
        d.setDate(d.getDate() + durationDays);
        return d.toISOString().split('T')[0];
      })()
    : '';

  // Calculate minimum date (tomorrow for delivery, today for pickup)
  const minDate = (() => {
    const d = new Date();
    if (deliveryRequested) d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  // Fetch available sets — only when dates are selected
  const fetchSets = useCallback(async () => {
    if (!startDate) return;
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

  // Auto-rotate hero image on dates step
  useEffect(() => {
    if (step !== 'dates') return;
    const timer = setInterval(() => {
      setHeroIndex(prev => (prev + 1) % HERO_IMAGES.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [step]);

  // Pricing
  const rentalPrice = selectedSet ? getCoursePrice(selectedSet, durationDays) : 0;
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
          notes: notes || undefined,
          source: 'booking_app' as const,
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
    <Layout hidePromotionBar>
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
              {step === 'dates' && 'Select your rental dates and duration.'}
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
                return (
                  <button
                    key={set.id}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => setSelectedSet(set)}
                    className={`w-full text-left p-4 sm:p-5 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-green-600 bg-green-50 shadow-md'
                        : isAvailable
                        ? 'border-gray-200 bg-white hover:border-green-300 hover:shadow-sm'
                        : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            set.tier === 'premium-plus'
                              ? 'bg-green-800 text-white'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {set.tier === 'premium-plus' ? 'Premium+' : 'Premium'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            set.gender === 'mens'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-pink-50 text-pink-700'
                          }`}>
                            {set.gender === 'mens' ? "Men's" : "Women's"}
                          </span>
                          {!isAvailable && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                              Unavailable
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-gray-900">{set.name}</h3>
                        {set.brand && (
                          <p className="text-sm text-gray-500">{set.brand} {set.model || ''}</p>
                        )}
                        {set.specifications && set.specifications.length > 0 && (
                          <p className="text-xs text-gray-400 mt-1">
                            {(set.specifications as string[]).join(' · ')}
                          </p>
                        )}
                      </div>
                      </div>
                  </button>
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
            {/* Hero image with auto-rotation */}
            <div className="relative aspect-[4/3] sm:aspect-[16/9] max-w-lg mx-auto rounded-xl overflow-hidden bg-gray-50 border border-gray-100 shadow-sm">
              {HERO_IMAGES.map((img, i) => (
                <img
                  key={img.alt}
                  src={img.src}
                  alt={img.alt}
                  className={`absolute inset-0 w-full h-full object-contain p-4 transition-opacity duration-700 ${
                    i === heroIndex ? 'opacity-100' : 'opacity-0'
                  }`}
                  loading={i === 0 ? 'eager' : 'lazy'}
                />
              ))}
              {/* Dots */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                {HERO_IMAGES.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setHeroIndex(i)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === heroIndex ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
              <input
                type="date"
                value={startDate}
                min={minDate}
                onChange={e => { setStartDate(e.target.value); setSelectedSet(null); }}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
              <div className="grid grid-cols-2 gap-3">
                {DURATION_OPTIONS.map(opt => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => { setDurationDays(opt.days); setSelectedSet(null); }}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      durationDays === opt.days
                        ? 'border-green-600 bg-green-50'
                        : 'border-gray-200 hover:border-green-300'
                    }`}
                  >
                    <p className="font-semibold text-gray-900">{opt.label}</p>
                    <p className="text-xs text-gray-500">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {startDate && (
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
                <p>
                  <span className="font-medium text-gray-900">Rental period:</span>{' '}
                  {new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' '}&rarr;{' '}
                  {new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' '}({durationDays} {durationDays === 1 ? 'day' : 'days'})
                </p>
              </div>
            )}

            <a
              href="https://www.len.golf/golf-course-club-rental/"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-sm text-green-700 hover:text-green-800 underline underline-offset-2"
            >
              View our available club sets on len.golf
            </a>

            <button
              onClick={goNext}
              disabled={!startDate}
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
                  onClick={() => { setDeliveryRequested(false); setPickupTime(''); setReturnTime(''); }}
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
                  onClick={() => { setDeliveryRequested(true); setPickupTime(''); setReturnTime(''); }}
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Delivery Time <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={pickupTime}
                      onChange={e => setPickupTime(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900"
                    >
                      <option value="">Select</option>
                      <option value="09:00">09:00</option>
                      <option value="10:00">10:00</option>
                      <option value="11:00">11:00</option>
                      <option value="12:00">12:00</option>
                      <option value="13:00">13:00</option>
                      <option value="14:00">14:00</option>
                      <option value="15:00">15:00</option>
                      <option value="16:00">16:00</option>
                      <option value="17:00">17:00</option>
                      <option value="18:00">18:00</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Return Time <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={returnTime}
                      onChange={e => setReturnTime(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900"
                    >
                      <option value="">Select</option>
                      <option value="09:00">09:00</option>
                      <option value="10:00">10:00</option>
                      <option value="11:00">11:00</option>
                      <option value="12:00">12:00</option>
                      <option value="13:00">13:00</option>
                      <option value="14:00">14:00</option>
                      <option value="15:00">15:00</option>
                      <option value="16:00">16:00</option>
                      <option value="17:00">17:00</option>
                      <option value="18:00">18:00</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-gray-400">We&apos;ll confirm the exact times with you.</p>
              </div>
            )}

            {!deliveryRequested && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pickup Time <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={pickupTime}
                    onChange={e => setPickupTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900"
                  >
                    <option value="">Select</option>
                    <option value="10:00">10:00</option>
                    <option value="11:00">11:00</option>
                    <option value="12:00">12:00</option>
                    <option value="13:00">13:00</option>
                    <option value="14:00">14:00</option>
                    <option value="15:00">15:00</option>
                    <option value="16:00">16:00</option>
                    <option value="17:00">17:00</option>
                    <option value="18:00">18:00</option>
                    <option value="19:00">19:00</option>
                    <option value="20:00">20:00</option>
                    <option value="21:00">21:00</option>
                    <option value="22:00">22:00</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Return Time <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={returnTime}
                    onChange={e => setReturnTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900"
                  >
                    <option value="">Select</option>
                    <option value="10:00">10:00</option>
                    <option value="11:00">11:00</option>
                    <option value="12:00">12:00</option>
                    <option value="13:00">13:00</option>
                    <option value="14:00">14:00</option>
                    <option value="15:00">15:00</option>
                    <option value="16:00">16:00</option>
                    <option value="17:00">17:00</option>
                    <option value="18:00">18:00</option>
                    <option value="19:00">19:00</option>
                    <option value="20:00">20:00</option>
                    <option value="21:00">21:00</option>
                    <option value="22:00">22:00</option>
                  </select>
                </div>
                <p className="text-xs text-gray-400 col-span-2">Mercury Ville @ BTS Chidlom, Floor 4</p>
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
                        <p className="text-sm font-bold text-green-700">฿{item.price.toLocaleString()}</p>
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

            <button
              onClick={goNext}
              disabled={!pickupTime || !returnTime || (deliveryRequested && !deliveryAddress.trim())}
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
                {' '}&rarr;{' '}
                {new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
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
                    <span className="text-gray-600">฿{a.price.toLocaleString()}</span>
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
                <div className="flex justify-between">
                  <span className="text-gray-700">Club rental ({durationDays}d)</span>
                  <span className="text-gray-900">฿{rentalPrice.toLocaleString()}</span>
                </div>
                {deliveryRequested && (
                  <div className="flex justify-between">
                    <span className="text-gray-700">Delivery & return</span>
                    <span className="text-gray-900">฿{deliveryFee.toLocaleString()}</span>
                  </div>
                )}
                {addOns.map(a => (
                  <div key={a.key} className="flex justify-between">
                    <span className="text-gray-700">{a.label}</span>
                    <span className="text-gray-900">฿{a.price.toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-green-300 font-bold text-base">
                  <span className="text-green-800">Total</span>
                  <span className="text-green-800">฿{totalPrice.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Payment info */}
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-sm text-blue-800">
              <p className="font-medium mb-1">Payment</p>
              <p>Our team will contact you within 2 hours to confirm availability and arrange payment. No payment is required now.</p>
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
                <p className="text-xl font-bold text-green-700">฿{totalPrice.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
              <p className="font-medium mb-1">What happens next?</p>
              <p>Our team will contact you within 2 hours via phone or LINE to confirm your reservation and arrange payment.</p>
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
    </Layout>
  );
}
