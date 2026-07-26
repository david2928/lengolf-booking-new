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
    /* The same in-flow chrome as `/bookings`, all four props, no asymmetry.

       `hideFooter` used to be left off here on the argument that the moment
       after a booking is confirmed is exactly when someone wants the address,
       the opening hours and directions. Owner overruled it: "why it still shows
       after the confirmation? the footer".

       They are right, and the argument was weaker than it looked. Everything it
       claimed the footer was needed for, except one item, is already on its way
       to the customer by email — `emails.bookingConfirmation` carries the
       address, a "How to find us" maps link, the phone number and the LINE
       contact, and this very page tells them that email has just been sent. The
       exception is the OPENING HOURS, which live only in `messages.footer` and
       are rendered only by `SharedFooter`; they are now absent from this page
       and from the mail. That is an acceptable loss here specifically, because
       a customer reading this screen has just booked a slot inside those hours
       and been told when to arrive. If a post-booking surface ever does need
       them, add them to `ConfirmationContent` — do not bring the whole
       marketing footer back to carry one line.

       `flushMain` drops Layout's own `container mx-auto px-4 … py-8`, so the
       padding has to be replaced or the cards sit flush against the viewport
       edge: `ConfirmationContent`'s outermost element is a bare
       `max-w-4xl mx-auto` with no padding of its own. Hence the wrapper below,
       matching the one on `/bookings`. */
    <Layout hidePromotionBar compactHeader flushMain hideFooter>
      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <ConfirmationContent booking={booking} />
      </div>
    </Layout>
  );
}