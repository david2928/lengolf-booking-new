'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface GuestFormData {
  name: string;
  email: string;
  phone: string;
}

export default function GuestForm({ onClose }: { onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<GuestFormData>({
    name: '',
    email: '',
    phone: '',
  });
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // First sign in as guest
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: 'guest@lengolf.com',
        password: process.env.NEXT_PUBLIC_GUEST_PASSWORD!,
      });

      if (authError) {
        console.error('Auth error:', authError);
        throw new Error('Guest login is temporarily unavailable. Please try again later.');
      }

      // Then create a guest profile
      const { data: profile, error: profileError } = await supabase
        .from('guest_profiles')
        .insert({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
        })
        .select()
        .single();

      if (profileError) {
        console.error('Profile error:', profileError);
        throw new Error('Unable to create guest profile. Please try again.');
      }

      // Store guest information in localStorage
      localStorage.setItem('email', formData.email);
      localStorage.setItem('name', formData.name);
      localStorage.setItem('phoneNumber', formData.phone);
      localStorage.setItem('loginMethod', 'guest');
      localStorage.setItem('loginTime', Date.now().toString());

      // Redirect to bookings page
      router.push('/bookings');
      router.refresh();
    } catch (error) {
      console.error('Guest login failed:', error);
      setError(error instanceof Error ? error.message : 'Guest login failed');
      // Sign out if there was an error
      await supabase.auth.signOut();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-semibold mb-4">Continue as Guest</h2>
        
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-500">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              id="name"
              required
              placeholder="Enter your name"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              required
              placeholder="Enter your email"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input
              type="tel"
              id="phone"
              required
              placeholder="Enter your phone number"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <div className="flex gap-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Please wait...' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 