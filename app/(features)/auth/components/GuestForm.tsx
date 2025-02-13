'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';

interface GuestFormProps {
  onClose: () => void;
}

interface GuestFormData {
  name: string;
  email: string;
  phone: string;
}

export default function GuestForm({ onClose }: GuestFormProps) {
  const [formData, setFormData] = useState<GuestFormData>({
    name: '',
    email: '',
    phone: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await signIn('guest', {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        redirect: false
      });

      if (result?.error) {
        setError('Failed to create guest session. Please try again.');
        setIsSubmitting(false);
        return;
      }

      window.location.href = '/bookings';
    } catch (err) {
      console.error('Guest login error:', err);
      setError('Failed to create guest session. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-semibold mb-4">Guest Information</h2>
        
        {error && (
          <div className="mb-4 p-2 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              type="text"
              id="name"
              required
              disabled={isSubmitting}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-100 disabled:cursor-not-allowed"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              id="email"
              required
              disabled={isSubmitting}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-100 disabled:cursor-not-allowed"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
              Phone
            </label>
            <input
              type="tel"
              id="phone"
              required
              disabled={isSubmitting}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-100 disabled:cursor-not-allowed"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="relative px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-90 disabled:cursor-not-allowed min-w-[100px]"
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  <span>Processing...</span>
                </div>
              ) : (
                'Continue'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 