'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Provider } from '@supabase/supabase-js';
import { GoogleIcon, FacebookIcon, LineIcon, UserIcon } from '@/components/icons';
import GuestForm from '@/components/auth/GuestForm';
import { useRouter } from 'next/navigation';
import { debug } from '@/lib/debug';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/app/types/supabase';

type LoginProvider = Provider | 'guest' | 'line';

export default function LoginForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(null);
  const router = useRouter();

  useEffect(() => {
    const initSupabase = async () => {
      const client = await createClient();
      setSupabase(client);
    };
    initSupabase();
  }, []);

  const handleLogin = async (provider: LoginProvider) => {
    if (!supabase) {
      setError('Authentication service not available');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      if (provider === 'guest') {
        setShowGuestForm(true);
        return;
      }

      if (provider === 'line') {
        // TODO: Implement LINE login
        console.log('LINE login will be implemented separately');
        return;
      }

      debug.log('LoginForm: Starting OAuth login', { provider });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider as Provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });

      if (error) {
        debug.error('LoginForm: OAuth error', error);
        throw error;
      }
      
      debug.log('LoginForm: OAuth initiated', { 
        hasUrl: !!data?.url,
        provider 
      });

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No OAuth URL returned');
      }
    } catch (error) {
      debug.error('LoginForm: Login failed', error);
      setError(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-500">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => handleLogin('google')}
          disabled={isLoading || !supabase}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          <GoogleIcon />
          <span>Continue with Google</span>
        </button>

        <button
          type="button"
          onClick={() => handleLogin('facebook')}
          disabled={isLoading || !supabase}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#1877F2] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#166FE5] disabled:opacity-50"
        >
          <FacebookIcon />
          <span>Continue with Facebook</span>
        </button>

        <button
          type="button"
          onClick={() => handleLogin('line')}
          disabled={isLoading || !supabase}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#00B900] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#00A000] disabled:opacity-50"
        >
          <LineIcon />
          <span>Continue with LINE</span>
        </button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-2 text-gray-500">Or</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleLogin('guest')}
          disabled={isLoading || !supabase}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
        >
          <UserIcon />
          <span>Continue as Guest</span>
        </button>

        {isLoading && (
          <div className="mt-4 text-center text-sm text-gray-500">
            Please wait...
          </div>
        )}
      </div>

      {showGuestForm && (
        <GuestForm onClose={() => setShowGuestForm(false)} />
      )}
    </>
  );
} 