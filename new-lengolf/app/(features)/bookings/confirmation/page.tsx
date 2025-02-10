import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { format } from 'date-fns';
import { CheckCircleIcon, CalendarIcon, ClockIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { Layout } from '../components/booking/Layout';
import { Booking } from '@/types';
import { ConfirmationContent } from '../components/booking/ConfirmationContent';

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

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login');
  }

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
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