import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/utils/supabase/server';
import { format } from 'date-fns';
import { CheckCircleIcon, CalendarIcon, ClockIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { Layout } from '../components/booking/Layout';
import { Booking } from '@/types';
import { ConfirmationContent } from '../components/booking/ConfirmationContent';
import { getServerSession } from 'next-auth';

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

  const session = await getServerSession();
  if (!session) {
    redirect('/auth/login');
  }

  const supabase = createServerClient();
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