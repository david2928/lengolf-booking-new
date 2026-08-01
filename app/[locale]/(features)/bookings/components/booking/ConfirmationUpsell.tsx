'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ProviderButtons } from '@/components/auth/ProviderButtons';
import { saveClaimHandoff, takeClaimHandoff } from './claimHandoff';

/**
 * Offered to a customer who has just booked as a GUEST: sign in, and this
 * booking comes with you.
 *
 * ── Why it is offered here and not earlier ────────────────────────────────
 * This is the one moment a guest has something concrete to gain. Before the
 * booking exists, "create an account" is a chore; immediately after it, "keep
 * this booking" is an obvious yes. It is also the only moment we can make the
 * offer TRUE, because the claim token is minted from the guest session that
 * created the booking and lives 30 minutes.
 *
 * ── Why the claim endpoint is not optional ────────────────────────────────
 * Without it this component lies. OAuth profiles are created with no phone
 * number, so `profiles.customer_id` is never set, and the VIP portal reads
 * exactly that column — the customer would tap "see your bookings" and find an
 * empty page. The claim runs on return and links the new profile to the
 * customer record the booking already created.
 *
 * ── Shown once, then not again ────────────────────────────────────────────
 * Guests who ignore it are not asked twice on the same booking, and the
 * component disappears entirely once the claim succeeds.
 */
interface ConfirmationUpsellProps {
  bookingId: string;
  /** Only guests see this. A signed-in customer already has what it offers. */
  isGuest: boolean;
  /** Null when the token could not be minted; the upsell then stays hidden. */
  claimToken: string | null;
  /** Locale-prefixed, query-free return path back to this confirmation page. */
  callbackUrl: string;
}

type ClaimState = 'idle' | 'claiming' | 'claimed' | 'failed';

export function ConfirmationUpsell({
  bookingId,
  isGuest,
  claimToken,
  callbackUrl,
}: ConfirmationUpsellProps) {
  const t = useTranslations('bookings.confirmation');
  const [claim, setClaim] = useState<ClaimState>('idle');

  // On return from the provider, finish the job. `takeClaimHandoff` clears as
  // it reads, so a failure is not retried on every subsequent page load.
  useEffect(() => {
    const handoff = takeClaimHandoff();
    if (!handoff) return;

    let cancelled = false;
    setClaim('claiming');

    fetch(`/api/bookings/${encodeURIComponent(handoff.bookingId)}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: handoff.token }),
    })
      .then((res) => {
        if (cancelled) return;
        setClaim(res.ok ? 'claimed' : 'failed');
      })
      .catch(() => {
        if (!cancelled) setClaim('failed');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (claim === 'claimed') {
    return (
      <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4">
        <p className="text-sm font-medium text-green-900">{t('upsellLinkedTitle')}</p>
        <p className="mt-1 text-sm text-green-800">{t('upsellLinkedBody')}</p>
      </div>
    );
  }

  // A guest with no mintable token gets nothing rather than an offer that
  // cannot be honoured.
  if (!isGuest || !claimToken || claim === 'claiming') return null;

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium text-gray-900">{t('upsellTitle')}</p>
      <p className="mt-1 mb-3 text-sm text-gray-600">{t('upsellBody')}</p>

      {claim === 'failed' && (
        // Deliberately not alarming: the booking is safe and confirmed either
        // way. Only the linking failed, and it is not something they did.
        <p className="mb-3 text-xs text-amber-700">{t('upsellFailed')}</p>
      )}

      <ProviderButtons
        callbackUrl={callbackUrl}
        layout="compact"
        surface="confirmation_upsell"
        // Stored synchronously before the redirect, exactly like the contact
        // draft on the details step. Anything async races the navigation.
        onBeforeSignIn={() => saveClaimHandoff({ bookingId, token: claimToken })}
        minHeightClass="min-h-[8.75rem] sm:min-h-[2.75rem]"
      />
    </div>
  );
}
