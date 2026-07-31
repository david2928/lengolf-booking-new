import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';
import { createAdminClient } from '@/utils/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * One unexpired credit grant with hours still on it.
 *
 * `hours` is what remains, not what was granted — `get_credit_balance` nets off
 * active redemptions.
 */
interface CreditGrant {
  hours: number;
  /** ISO instant. End of the last valid day in Bangkok, for a B1G1 grant. */
  expiresAt: string;
}

/**
 * The customer's simulator-hour credit balance, for read-only display in the
 * booking flow.
 *
 * Shaped exactly like `/api/user/active-packages`: `force-dynamic`, never a
 * 401, and every failure path — signed out, no linked customer, RPC error,
 * thrown exception — degrades to the same empty shape. The card that consumes
 * this renders nothing on an empty list, so a degraded response is invisible
 * rather than wrong. That matters more here than usual: exactly one customer in
 * the whole system has a balance today, so "empty" is the overwhelmingly common
 * correct answer and must never look like a card.
 *
 * READ-ONLY on purpose (owner-confirmed): customers cannot self-redeem. Staff
 * apply credits from lengolf-forms via `backoffice.redeem_credits`. Nothing
 * here reaches `lib/cost-calculator.ts` — the quoted total is unaffected by a
 * credit balance and this route must not change that.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ credits: [] });
    }

    const supabase = createAdminClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('customer_id')
      .eq('id', session.user.id)
      .single();

    if (!profile?.customer_id) {
      return NextResponse.json({ credits: [] });
    }

    // public.get_customer_credit_balance wraps backoffice.get_credit_balance,
    // which already excludes expired and fully-redeemed grants and orders by
    // soonest expiry. Preserve that order — the card shows the expiry the
    // customer needs to act on first.
    const { data, error } = await supabase.rpc('get_customer_credit_balance', {
      p_customer_id: profile.customer_id,
      p_credit_type: 'sim_hour',
    });

    if (error) {
      console.error('[credit-balance] RPC error:', error);
      return NextResponse.json({ credits: [] });
    }

    const rows = (data ?? []) as Array<{ remaining: number | string | null; expires_at: string | null }>;
    const credits: CreditGrant[] = rows
      .map((row) => ({
        // `numeric` arrives as a string over PostgREST.
        hours: Number(row.remaining),
        expiresAt: row.expires_at ?? '',
      }))
      .filter((c) => Number.isFinite(c.hours) && c.hours > 0 && c.expiresAt !== '');

    return NextResponse.json({ credits });
  } catch (error) {
    console.error('[credit-balance] Error:', error);
    return NextResponse.json({ credits: [] });
  }
}
