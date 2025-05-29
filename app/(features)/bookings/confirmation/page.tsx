import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { format } from 'date-fns';
import { CheckCircleIcon, CalendarIcon, ClockIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { Layout } from '../components/booking/Layout';
import { Booking } from '@/types';
import { ConfirmationContent } from '../components/booking/ConfirmationContent';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';

export const metadata: Metadata = {
  title: 'Booking Confirmation - LENGOLF',
  description: 'Confirm your booking at LENGOLF',
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  
  if (!id) {
    redirect('/bookings');
  }

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/auth/login');
  }

  // Create a Supabase client with service role key to access booking data
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    }
  );
  const { data: booking, error: bookingError } = await supabase
    .from('bookings_vip_staging')
    .select('*')
    .eq('id', id)
    .single();

  if (bookingError || !booking) {
    redirect('/bookings');
  }

  return (
    <Layout>
      <ConfirmationContent booking={booking} />
    </Layout>
  );
} 