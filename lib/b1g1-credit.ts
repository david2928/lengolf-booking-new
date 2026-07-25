/**
 * The B1G1 new-customer free hour, as a real grant.
 *
 * When a new customer books UNDER 2 hours, `lib/cost-calculator.ts` prints
 * "Book 2 hours to get 1 hour free! Or redeem your free hour within 7 days" and
 * the staff LINE note prints "(1 free hr to redeem within 7 days, expires
 * <date>)". This module is what makes that promise real: it records a
 * `b1g1_new_customer` row in `backoffice.credit_grants`, which is the ledger
 * staff redeem against from lengolf-forms.
 *
 * The 2-hour-or-longer path is NOT handled here. There the free hour is
 * consumed by the booking itself and priced out of the bay rate, so there is
 * nothing to carry forward.
 *
 * Two rules this file exists to keep:
 *
 *  1. The printed expiry and the stored expiry are the SAME calculation.
 *     `b1g1CreditExpiry` returns both the label the staff note prints and the
 *     instant the row stores, so they cannot drift apart.
 *  2. Granting must never break a booking. `grantB1G1NewCustomerCredit`
 *     resolves rather than throws; the caller decides how loudly to complain.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

/** Matches the "within 7 days" in the customer copy and the staff note. */
export const B1G1_REDEMPTION_DAYS = 7;

/**
 * `granted_by` is NOT NULL and today holds staff email addresses (the one
 * pre-existing row was granted by a person). A grant minted by the booking flow
 * has no person behind it, so it gets a stable system identifier instead —
 * greppable, and never mistaken for someone's account.
 */
export const B1G1_GRANTED_BY = 'booking-system:b1g1';

/**
 * Bangkok is UTC+7 with no DST, so end-of-day there is always 16:59:59.999Z of
 * the same calendar date.
 */
const BANGKOK_END_OF_DAY_UTC = { hours: 16, minutes: 59, seconds: 59, ms: 999 };

export interface B1G1Expiry {
  /** The instant stored in `credit_grants.expires_at`. */
  expiresAt: Date;
  /** `d MMM` (en-GB), the form the staff LINE note has always printed. */
  label: string;
  /** `yyyy-MM-dd` — the calendar date the credit is good through. */
  calendarDate: string;
}

/**
 * Seven days on from the booking date, expiring at the END of that day in
 * Bangkok.
 *
 * End-of-day rather than an arbitrary instant because that is what the copy
 * means: a customer told "within 7 days" on a booking dated the 25th reads that
 * as "through the 1st", not "before whatever o'clock the booking was created".
 * Anchoring to Bangkok matters because the venue is in Bangkok — a grant that
 * silently died at 07:00 local on its last day would be a worse promise than
 * the one we printed.
 *
 * Every step runs in UTC arithmetic on purpose. The previous inline version in
 * the create route used `new Date(date)` (UTC midnight) plus local-timezone
 * `getDate`/`setDate`, which prints the right day only because Vercel runs in
 * UTC; on a server west of Greenwich it was off by one. The printed label is
 * unchanged on a UTC host — this only removes the dependency on the host.
 *
 * @param bookingDate `yyyy-MM-dd`. Returns null if it is not that shape.
 */
export function b1g1CreditExpiry(bookingDate: string): B1G1Expiry | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bookingDate);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  // Date.UTC rolls month/year over for us, so day + 7 needs no calendar maths.
  const calendar = new Date(Date.UTC(year, month - 1, day + B1G1_REDEMPTION_DAYS));
  if (Number.isNaN(calendar.getTime())) return null;

  const expiresAt = new Date(
    Date.UTC(
      calendar.getUTCFullYear(),
      calendar.getUTCMonth(),
      calendar.getUTCDate(),
      BANGKOK_END_OF_DAY_UTC.hours,
      BANGKOK_END_OF_DAY_UTC.minutes,
      BANGKOK_END_OF_DAY_UTC.seconds,
      BANGKOK_END_OF_DAY_UTC.ms,
    ),
  );

  return {
    expiresAt,
    // `timeZone: 'UTC'` so the label reads off the same calendar date the row
    // stores, whatever the host clock is set to.
    label: calendar.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }),
    calendarDate: calendar.toISOString().slice(0, 10),
  };
}

export interface GrantB1G1Params {
  customerId: string;
  /** The promotion's `free_hours`. */
  freeHours: number;
  expiresAt: Date;
  /** Recorded in `note` so a grant is traceable back to what earned it. */
  bookingId: string;
}

export type GrantB1G1Result =
  | { ok: true; grantId: string | null; created: boolean }
  | { ok: false; error: string };

/**
 * Records the grant. Idempotent — the partial unique index
 * `credit_grants_one_b1g1_per_customer` guarantees one B1G1 grant per customer
 * ever, and the RPC reports a conflict as `created: false` rather than an
 * error, so a retried booking-create cannot double-grant.
 *
 * Never throws. A grant we fail to write is a broken promise to a paying
 * customer, but it is still not a reason to fail their booking — the caller
 * logs it loudly and carries on.
 */
export async function grantB1G1NewCustomerCredit(
  supabase: SupabaseClient<Database>,
  { customerId, freeHours, expiresAt, bookingId }: GrantB1G1Params,
): Promise<GrantB1G1Result> {
  if (!customerId) return { ok: false, error: 'no customer_id' };
  if (!(freeHours > 0)) return { ok: false, error: `non-positive free_hours: ${freeHours}` };

  try {
    const { data, error } = await supabase.rpc('grant_b1g1_new_customer_credit', {
      p_customer_id: customerId,
      p_quantity: freeHours,
      p_expires_at: expiresAt.toISOString(),
      p_note: `B1G1 free hour earned by booking ${bookingId}`,
      p_granted_by: B1G1_GRANTED_BY,
    });

    if (error) return { ok: false, error: error.message };

    // RETURNS TABLE, so PostgREST hands back an array of one row.
    const row = Array.isArray(data) ? data[0] : data;
    return {
      ok: true,
      grantId: (row as { grant_id?: string } | null)?.grant_id ?? null,
      created: (row as { created?: boolean } | null)?.created === true,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
