'use client';

import { useState } from 'react';
import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

interface LinkAccountFormProps {
  lineUserId: string;
  displayName: string;
  pictureUrl?: string;
  language: Language;
  onSuccess: () => void;
}

export default function LinkAccountForm({
  lineUserId,
  displayName,
  pictureUrl,
  language,
  onSuccess
}: LinkAccountFormProps) {
  const t = membershipTranslations[language];
  const [phoneNumber, setPhoneNumber] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    // Validate phone number
    if (!phoneNumber) {
      setError('Phone number is required');
      return;
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      setError('Please enter a valid phone number');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/liff/membership/link-or-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lineUserId,
          displayName,
          pictureUrl,
          phoneNumber,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle specific error codes
        if (response.status === 409 && data.code === 'CUSTOMER_ALREADY_LINKED') {
          throw new Error(data.error || 'This phone number is already linked to another account.');
        }
        throw new Error(data.error || 'Failed to link account');
      }

      const message = data.isNewCustomer ? t.accountCreated : t.accountLinked;
      setSuccessMessage(message);

      // Wait a bit to show success message
      setTimeout(() => {
        onSuccess();
      }, 1000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6">
        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            {pictureUrl ? (
              <img
                src={pictureUrl}
                alt={displayName}
                className="w-20 h-20 rounded-full object-cover"
              />
            ) : (
              <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {t.welcome}, {displayName}!
          </h2>
          <p className="text-gray-600 text-sm">
            {t.linkAccountDescription}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              {t.enterPhone}
            </label>
            <PhoneInput
              international
              defaultCountry="TH"
              placeholder={t.phoneNumberPlaceholder}
              value={phoneNumber}
              onChange={setPhoneNumber}
              disabled={isLoading}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed ${
                phoneNumber && !isValidPhoneNumber(phoneNumber)
                  ? 'border-red-500'
                  : phoneNumber && isValidPhoneNumber(phoneNumber)
                  ? 'border-green-500'
                  : 'border-gray-300'
              }`}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-600">{successMessage}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !phoneNumber}
            className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-lg hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? t.linking : t.linkButton}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-500">
            {t.contactStaff}
          </p>
          <a
            href="https://lin.ee/uxQpIXn"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-sm font-medium hover:underline mt-1 inline-block"
          >
            {t.contactUs}
          </a>
        </div>
      </div>
    </div>
  );
}
