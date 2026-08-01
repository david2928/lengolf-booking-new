import { NextResponse, type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createAdminClient } from '@/utils/supabase/admin';
import { verifyClaimToken } from '@/lib/auth/claim-token';
import { findOrCreateCustomer } from '@/utils/customer-service';

/**
 * Attach a booking made as a GUEST to the account the customer has just signed
 * into.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * The confirmation upsell tells a guest that signing in will show them their
 * bookings. Without this route that is false at the moment it is offered:
 * OAuth profiles are created with NO phone number (`app/api/auth/options.ts`),
 * so `profiles.customer_id` is never set, and `/api/vip/status` reads exactly
 * that column and answers `not_linked`. The customer taps "see your bookings"
 * and lands on an empty portal — the upsell disproving itself on first use.
 *
 * ── Authorisation ─────────────────────────────────────────────────────────
 * Cannot be ownership: the caller is signing in as a DIFFERENT profile than the
 * one that booked, which is the entire point. Instead the confirmation page
 * mints a short-lived HMAC token while the guest session is still valid, and it
 * rides sessionStorage across the OAuth hop. Possession is the proof.
 *
 * ── What is trusted ───────────────────────────────────────────────────────
 * Only the session and the token. The phone used for matching is read
 * SERVER-SIDE from the booking row — never from the request body — so a caller
 * cannot claim a booking onto an arbitrary phone number and inherit a stranger's
 * customer record.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await context.params;

  const session = await getServerSession(authOptions);
  const profileId = (session?.user as { id?: string } | undefined)?.id;
  if (!profileId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // A guest claiming onto another guest achieves nothing and would just move
  // the booking sideways. The point is to attach it to a real provider account.
  const provider = (session?.user as { provider?: string } | undefined)?.provider;
  if (provider === 'guest') {
    return NextResponse.json(
      { error: 'Forbidden', code: 'GUEST_SESSION_NOT_ELIGIBLE' },
      { status: 403 }
    );
  }

  let token: string | undefined;
  try {
    const body = await request.json();
    token = typeof body?.token === 'string' ? body.token : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const verified = verifyClaimToken(token, bookingId);
  if (!verified.ok) {
    // One status and one message for every failure mode. Distinguishing expired
    // from forged from wrong-booking would tell a prober which of those they
    // got right. The reason is logged, not returned.
    console.warn('[Claim] token rejected', { bookingId, reason: verified.reason });
    return NextResponse.json({ error: 'Invalid or expired claim' }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, user_id, customer_id, name, email, phone_number')
    .eq('id', bookingId)
    .maybeSingle();

  if (bookingError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // The token names the profile it was issued to. If that is not the profile
  // that owns the booking, the token was minted somewhere it should not have
  // been — refuse rather than reason about it.
  if (booking.user_id !== verified.claims.profileId) {
    console.warn('[Claim] token profile does not own the booking', { bookingId });
    return NextResponse.json({ error: 'Invalid or expired claim' }, { status: 403 });
  }

  if (!booking.phone_number) {
    // Nothing to match on. `findOrCreateCustomer` keys on phone alone.
    return NextResponse.json(
      { error: 'Booking has no phone number to match on', code: 'NO_PHONE' },
      { status: 409 }
    );
  }

  // Idempotent: if this profile is already linked to the booking's customer,
  // the claim has already happened (a double tap, a retry). Report success
  // rather than doing the work twice.
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('customer_id')
    .eq('id', profileId)
    .maybeSingle();

  if (callerProfile?.customer_id && callerProfile.customer_id === booking.customer_id) {
    return NextResponse.json({ ok: true, alreadyLinked: true });
  }

  try {
    // Reuses the ONE matcher the whole app agrees on, with values read from the
    // booking row. No new matching logic and no new trust surface: this is
    // exactly what would have happened had the customer been signed in when
    // they booked.
    await findOrCreateCustomer(
      profileId,
      booking.name,
      booking.phone_number,
      booking.email ?? undefined
    );
  } catch (err) {
    console.error('[Claim] findOrCreateCustomer failed', { bookingId, err });
    return NextResponse.json({ error: 'Could not link the booking' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
