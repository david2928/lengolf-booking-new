import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { getTranslations } from 'next-intl/server';
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
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single();

  if (bookingError || !booking) {
    redirect('/bookings');
  }

  return (
    /* Same in-flow chrome as `/bookings`, minus the footer — and the asymmetry
       is the decision, not an oversight.

       `compactHeader`, `hidePromotionBar` and `flushMain` are taken so the last
       screen of the flow does not snap back to a tall header and a promo banner
       the customer just spent three steps without. `hideFooter` is NOT taken:
       mid-flow the long marketing footer is a distraction under a checkout, but
       the moment after a booking is confirmed is exactly when someone wants the
       address, the opening hours and directions, and the footer is where those
       live. Suppressing it here would hide the one thing this page's reader is
       most likely to go looking for next.

       `flushMain` drops Layout's own `container mx-auto px-4 … py-8`, so the
       padding has to be replaced or the cards sit flush against the viewport
       edge: `ConfirmationContent`'s outermost element is a bare
       `max-w-4xl mx-auto` with no padding of its own. Hence the wrapper below,
       matching the one on `/bookings`. It carries no `max-w-*` — the content
       already sets its own, narrower one. */
    <Layout hidePromotionBar compactHeader flushMain>
      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <ConfirmationContent booking={booking} />
      </div>
    </Layout>
  );
}