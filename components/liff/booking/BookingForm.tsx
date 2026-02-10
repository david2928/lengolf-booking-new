'use client';

import { useState, useEffect } from 'react';
import { Language } from '@/lib/liff/translations';
import { bookingTranslations } from '@/lib/liff/booking-translations';
import { PLAY_FOOD_PACKAGES, PlayFoodPackage } from '@/types/play-food-packages';
import { BayType } from '@/lib/bayConfig';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

export interface BookingFormData {
  name: string;
  phone: string;
  email: string;
  duration: number;
  numberOfPeople: number;
  bayPreference: BayType | null;
  playFoodPackage: PlayFoodPackage | null;
  clubRental: 'none' | 'standard' | 'premium';
  notes: string;
}

export interface UserProfile {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface ActivePackage {
  id: string;
  displayName: string;
  remainingHours: number;
}

interface BookingFormProps {
  language: Language;
  maxDuration: number;
  profile?: UserProfile | null;
  activePackage?: ActivePackage | null;
  formData: BookingFormData;
  onFormChange: (data: BookingFormData) => void;
  errors?: Record<string, string>;
}

export default function BookingForm({
  language,
  maxDuration,
  profile,
  activePackage,
  formData,
  onFormChange,
  errors = {}
}: BookingFormProps) {
  const t = bookingTranslations[language];
  const [isInitialized, setIsInitialized] = useState(false);

  // Pre-fill form data from profile on first load
  useEffect(() => {
    if (!isInitialized && profile) {
      onFormChange({
        ...formData,
        name: profile.name || formData.name,
        email: profile.email || formData.email,
        phone: profile.phone || formData.phone
      });
      setIsInitialized(true);
    }
  }, [profile, isInitialized, formData, onFormChange]);

  const updateField = <K extends keyof BookingFormData>(field: K, value: BookingFormData[K]) => {
    onFormChange({ ...formData, [field]: value });
  };

  const durationOptions = Array.from({ length: Math.min(maxDuration, 5) }, (_, i) => i + 1);
  const peopleOptions = [1, 2, 3, 4, 5];

  return (
    <div className="space-y-4">
      {/* Active Package Banner */}
      {activePackage && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium text-primary">{t.usingPackage}</div>
              <div className="text-sm text-gray-700">{activePackage.displayName}</div>
              <div className="text-xs text-gray-500">{activePackage.remainingHours} {t.hoursRemaining}</div>
            </div>
          </div>
        </div>
      )}

      {/* Contact Information */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <h3 className="text-base font-semibold text-gray-900 mb-3">{t.contactInfo}</h3>

        <div className="space-y-3">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.name}</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder={t.namePlaceholder}
              className={`w-full px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${
                errors.name ? 'border-red-500' : 'border-gray-200'
              }`}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.phone}</label>
            <PhoneInput
              international
              defaultCountry="TH"
              placeholder={t.phonePlaceholder}
              value={formData.phone}
              onChange={(value) => updateField('phone', value || '')}
              className={`w-full px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${
                errors.phone ? 'border-red-500' : formData.phone && isValidPhoneNumber(formData.phone) ? 'border-green-500' : 'border-gray-200'
              }`}
            />
            {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.email}</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder={t.emailPlaceholder}
              className={`w-full px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${
                errors.email ? 'border-red-500' : 'border-gray-200'
              }`}
            />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>
        </div>
      </div>

      {/* Duration & People */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <h3 className="text-base font-semibold text-gray-900 mb-3">{t.bookingDetails}</h3>

        <div className="space-y-4">
          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t.duration}</label>
            <div className="flex gap-2">
              {durationOptions.map((hours) => (
                <button
                  key={hours}
                  onClick={() => updateField('duration', hours)}
                  className={`flex-1 py-3 px-2 rounded-lg text-center transition-all ${
                    formData.duration === hours
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-sm font-medium">{hours}</span>
                  <span className="text-xs ml-1">{hours === 1 ? t.hour : t.hours}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Number of People */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t.numberOfPeople}</label>
            <div className="flex gap-2">
              {peopleOptions.map((num) => (
                <button
                  key={num}
                  onClick={() => updateField('numberOfPeople', num)}
                  className={`flex-1 py-3 px-2 rounded-lg text-center transition-all ${
                    formData.numberOfPeople === num
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-sm font-medium">{num}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Play & Food Packages */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">{t.playFoodPackages}</h3>
          <a
            href="/play-and-food"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            {t.viewDetails}
          </a>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => {
              updateField('playFoodPackage', null);
            }}
            className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
              formData.playFoodPackage === null
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-gray-300 text-gray-700 hover:border-primary'
            }`}
          >
            <span className="font-semibold text-[11px]">{t.bayOnly}</span>
            <span className="text-[10px] mt-0.5 opacity-75">{t.normalRates}</span>
          </button>

          {PLAY_FOOD_PACKAGES.map((pkg) => {
            const isAvailable = pkg.duration <= maxDuration;
            return (
              <button
                key={pkg.id}
                disabled={!isAvailable}
                onClick={() => {
                  if (isAvailable) {
                    updateField('playFoodPackage', pkg);
                    updateField('duration', pkg.duration);
                  }
                }}
                className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
                  formData.playFoodPackage?.id === pkg.id
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : !isAvailable
                    ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                    : 'border-gray-300 text-gray-700 hover:border-primary'
                }`}
              >
                <span className="text-lg font-bold mb-1">{pkg.id.split('_')[1]}</span>
                <span>฿{pkg.price.toLocaleString()}</span>
              </button>
            );
          })}
        </div>

        {formData.playFoodPackage ? (
          <div className="mt-3 p-3 bg-primary/5 rounded-lg">
            <div className="text-sm font-medium text-primary mb-1">
              {formData.playFoodPackage.name} - {formData.playFoodPackage.duration} {formData.playFoodPackage.duration > 1 ? t.hours : t.hour} - ฿{formData.playFoodPackage.price.toLocaleString()} NET
            </div>
            <div className="text-xs text-gray-600">
              <span className="font-medium">{t.includes}:</span> Golf simulator, {formData.playFoodPackage.foodItems.map(f => f.name).join(', ')}
            </div>
          </div>
        ) : (
          <div className="mt-3 text-xs text-gray-500 text-center">
            {t.bayRentalNormalRates}
          </div>
        )}
      </div>

      {/* Club Rental */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">{t.clubRental}</h3>
          <a
            href="/golf-club-rental"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            {t.viewDetails}
          </a>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => updateField('clubRental', 'none')}
            className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
              formData.clubRental === 'none'
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-gray-300 text-gray-700 hover:border-primary'
            }`}
          >
            <span className="font-semibold text-[11px]">{t.noRental}</span>
            <span className="text-[10px] mt-0.5 opacity-75">{t.ownClubs}</span>
          </button>

          <button
            onClick={() => updateField('clubRental', 'standard')}
            className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
              formData.clubRental === 'standard'
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-gray-300 text-gray-700 hover:border-primary'
            }`}
          >
            <span className="font-semibold text-[11px]">{t.standardClubs}</span>
            <span className="text-[10px] mt-0.5 text-green-600">{t.free}</span>
          </button>

          <button
            onClick={() => updateField('clubRental', 'premium')}
            className={`flex flex-col h-16 items-center justify-center rounded-lg border text-xs ${
              formData.clubRental === 'premium'
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-gray-300 text-gray-700 hover:border-primary'
            }`}
          >
            <span className="font-semibold text-[11px]">
              <span className="text-primary font-bold">{t.premiumClubs}</span>
            </span>
            <span className="text-[10px] mt-0.5 opacity-75">฿150+</span>
          </button>
        </div>

        {formData.clubRental === 'premium' && (
          <div className="mt-3 p-4 bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg border border-primary/20">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-primary">{t.premiumClubsSelected}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center p-2 bg-white rounded-lg">
                <div className="text-xs text-gray-500">1 {t.hour}</div>
                <div className="text-sm font-bold text-gray-900">฿150</div>
              </div>
              <div className="text-center p-2 bg-white rounded-lg">
                <div className="text-xs text-gray-500">2 {t.hours}</div>
                <div className="text-sm font-bold text-gray-900">฿250</div>
              </div>
              <div className="text-center p-2 bg-white rounded-lg">
                <div className="text-xs text-gray-500">4 {t.hours}</div>
                <div className="text-sm font-bold text-gray-900">฿400</div>
              </div>
              <div className="text-center p-2 bg-white rounded-lg">
                <div className="text-xs text-gray-500">{t.fullDay}</div>
                <div className="text-sm font-bold text-gray-900">฿1,200</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <h3 className="text-base font-semibold text-gray-900 mb-3">{t.notes}</h3>
        <textarea
          value={formData.notes}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder={t.notesPlaceholder}
          rows={3}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
        />
      </div>
    </div>
  );
}
