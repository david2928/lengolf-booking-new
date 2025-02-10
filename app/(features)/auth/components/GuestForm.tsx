'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

interface GuestFormData {
  name: string;
  email: string;
  phone: string;
}

interface GuestFormProps {
  onClose: () => void;
}

export default function GuestForm({ onClose }: GuestFormProps) {
  const [formData, setFormData] = useState<GuestFormData>({
    name: '',
    email: '',
    phone: '',
  });
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const supabase = createClient();
      
      // Sign in with the shared guest account
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: 'guest@lengolf.com',
        password: process.env.NEXT_PUBLIC_GUEST_PASSWORD!
      });

      if (signInError) {
        throw signInError;
      }

      // Store guest information in guest_profiles
      const { error: profileError } = await supabase
        .from('guest_profiles')
        .insert({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          created_at: new Date().toISOString()
        });

      if (profileError) {
        console.error('Failed to create guest profile:', profileError);
        throw new Error('Failed to create guest profile');
      }

      // Store guest information in localStorage for booking
      localStorage.setItem('guest_name', formData.name);
      localStorage.setItem('guest_email', formData.email);
      localStorage.setItem('guest_phone', formData.phone);
      localStorage.setItem('guest_session', 'true');
      localStorage.setItem('guest_login_time', Date.now().toString());

      // Set cookie to identify guest session
      document.cookie = 'guest_session=true; path=/; max-age=86400; samesite=lax';

      router.push('/bookings');
      onClose();
    } catch (err) {
      console.error('Guest login error:', err);
      setError('Failed to create guest session. Please try again.');
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
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
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
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
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
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 