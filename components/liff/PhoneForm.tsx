'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PhoneFormProps {
  lineUserId: string;
  displayName: string;
  onSuccess: () => void;
}

export default function PhoneForm({ lineUserId, displayName, onSuccess }: PhoneFormProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/liff/save-phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lineUserId,
          phoneNumber,
          displayName
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save phone number');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-[#f5fef9] rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#005a32]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Welcome, {displayName}!
        </h2>
        <p className="text-gray-600">
          Enter your phone number to participate
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number
          </label>
          <Input
            id="phone"
            type="tel"
            placeholder="0812345678"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            required
            disabled={isLoading}
            className="w-full"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          disabled={isLoading || !phoneNumber}
          className="w-full bg-[#005a32] hover:bg-[#004225] text-white font-semibold py-6 transition-colors"
        >
          {isLoading ? 'Saving...' : 'Continue to Lucky Draw'}
        </Button>
      </form>

      <p className="text-xs text-gray-500 text-center mt-4">
        Your phone number will be used for prize redemption only
      </p>
    </div>
  );
}
