import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Database } from '@/types/supabase';
import { Layout } from '../components/booking/Layout';
import { ConfirmationContent } from '../components/booking/ConfirmationContent';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('bookings.confirmation');
  return {
    title: t('pageTitle'),
    description: t('pageDescription'),
  };
}

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  // next-intl's `redirect` requires an explicit locale on the server — there is
  // no client context to infer it from.
  const locale = await getLocale();

  if (!id) {
    redirect({ href: '/bookings', locale });
  }

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect({ href: '/auth/login', locale });
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
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single();

  if (bookingError || !booking) {
    redirect({ href: '/bookings', locale });
  }

  return (
    <Layout>
      <ConfirmationContent booking={booking} />
    </Layout>
  );
} 