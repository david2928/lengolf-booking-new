import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { Layout } from '../components/booking/Layout';
import { ConfirmationContent } from '../components/booking/ConfirmationContent';
import {
  CONFIRMATION_BOOKING_SELECT,
  canViewBooking,
} from '../components/booking/confirmationBooking';
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
  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  // Service role, so this query is not RLS-scoped and the ownership check below
  // is the ONLY thing standing between a caller and someone else's booking.
  // Booking ids are `BK` + YYMMDD + 4 base36 chars (see generateBookingId in
  // app/api/bookings/create/route.ts), i.e. ~1.68M per known date — enumerable,
  // not a secret. Treat them as identifiers, never as capability tokens.
  const supabase = createAdminClient();

  const [{ data: profile }, { data: booking, error: bookingError }] = await Promise.all([
    supabase.from('profiles').select('customer_id').eq('id', session.user.id).maybeSingle(),
    supabase.from('bookings').select(CONFIRMATION_BOOKING_SELECT).eq('id', id).maybeSingle(),
  ]);

  if (bookingError || !booking) {
    redirect('/bookings');
  }

  const mayView = canViewBooking({
    sessionUserId: session.user.id,
    profileCustomerId: profile?.customer_id,
    bookingUserId: booking.user_id,
    bookingCustomerId: booking.customer_id,
  });

  if (!mayView) {
    // Same destination as "not found", so this page cannot be used to probe
    // which booking ids exist.
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
       which restores that exact string so this page's content column lines up
       with the wordmark in `Header` — which applies the same `container
       mx-auto px-4 sm:px-6 lg:px-8` — instead of running wider than it between
       640px and 1280px. `max-w-4xl` on the content still wins inside it. */
    <Layout hidePromotionBar compactHeader flushMain hideFooter>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <ConfirmationContent booking={booking} />
      </div>
    </Layout>
  );
}