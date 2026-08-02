import { NextResponse, type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createAdminClient } from '@/utils/supabase/admin';
import { verifyClaimToken } from '@/lib/auth/claim-token';

/**
 * Attach a booking made as a GUEST to the account the customer has just signed
 * into.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * The confirmation upsell tells a guest that signing in will bring this booking
 * with them. Without this route that is false: the booking stays pointed at the
 * throwaway guest profile, and the account they just signed into never shows it.
 *
 * ── Authorisation ─────────────────────────────────────────────────────────
 * Cannot be ownership: the caller is signing in as a DIFFERENT profile than the
 * one that booked, which is the entire point. So `/api/bookings/create` issues a
 * short-lived HMAC token in its response, and it rides sessionStorage across the
 * OAuth hop. Possession is the proof.
 *
 * The token is issued at CREATE, not on the confirmation page — that distinction
 * is the security property. On the confirmation page the only available proof is
 * a session, and a guest session resolves on email alone, so anyone knowing a
 * customer's email could obtain one, open their booking, and be handed a valid
 * token for it. Issued at create, possession means this browser made this
 * booking, on the one request where that is knowable.
 *
 * ── What this deliberately does NOT do ────────────────────────────────────
 * It does not adopt the customer record. See the comment on the update below:
 * matching on a phone number the caller typed would hand a stranger's CRM
 * record to a durable OAuth identity, walking straight around the guest gate in
 * lib/auth/vip-access.ts.
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

  // Idempotent: already this profile's booking, so a double tap or a retry is
  // a no-op rather than a second write.
  if (booking.user_id === profileId) {
    return NextResponse.json({ ok: true, alreadyLinked: true });
  }

  // Move the BOOKING, not the identity.
  //
  // This deliberately does NOT call `findOrCreateCustomer`. That matcher keys on
  // PHONE ALONE (utils/customer-service.ts), and the phone here came off a
  // booking row that anyone could have typed. Calling it would adopt whichever
  // customer record that phone belongs to onto the caller's real, durable OAuth
  // profile — which then passes `denyVipAccess`, because it is not a guest.
  //
  // That is an account takeover, and it walks straight around the guest gate
  // this same changeset adds: book with someone else's phone, sign in, and the
  // VIP portal is now theirs. The phone is attacker-controlled input; a
  // customer record is not something to hand over on the strength of it.
  //
  // Re-pointing `user_id` is all the upsell ever promised — "this booking comes
  // with you" — and `/api/vip/bookings` already surfaces bookings by `user_id`
  // as well as `customer_id`, so the customer sees it either way.
  //
  // `customer_id` on the row is left alone: it is the CRM's link for this
  // booking and staff depend on it. What changes is who may see the booking in
  // the portal, not who the booking belongs to commercially.
  const { error: repointError } = await supabase
    .from('bookings')
    .update({ user_id: profileId })
    .eq('id', bookingId)
    // Guard against a concurrent claim: only move it if it is still where the
    // token said it was.
    .eq('user_id', verified.claims.profileId);

  if (repointError) {
    console.error('[Claim] failed to re-point booking', { bookingId, repointError });
    return NextResponse.json({ error: 'Could not link the booking' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
