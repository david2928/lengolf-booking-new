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
 * Both of those strings, and the call into this module, are gated on
 * `promotions.grants_credit` — NOT on `promotion_type = 'bogo'`. A second bogo
 * row (the weekday off-peak B1G1) exists and grants nothing; its sub-2-hour
 * hint says only "book 2 hours and your second hour is free" and no row is
 * written here. If you add a third bogo, the column is the only thing that
 * decides.
 *
 * The 2-hour-or-longer path is NOT handled here. There the free hour is
 * consumed by the booking itself and priced out of the bay rate, so there is
 * nothing to carry forward.
 *
 * Three rules this file exists to keep:
 *
 *  1. The printed expiry and the stored expiry are the SAME calculation.
 *     `b1g1CreditExpiry` returns both the label the staff note prints and the
 *     instant the row stores, so they cannot drift apart.
 *  2. The grant and the QUOTE ask the same question. `isB1G1GrantEligible` is
 *     the predicate behind the customer-facing promise, not the
 *     `is_new_customer` flag `findOrCreateCustomer` happens to return — see its
 *     doc comment for the two ways those disagree.
 *  3. Granting must never break a booking. Nothing here throws; the caller
 *     decides how loudly to complain.
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
 * @param bookingDate A `yyyy-M-d` calendar date, optionally with a time suffix
 *   that is ignored. Returns null only if there is no calendar date to read.
 *   The route validates `date` for presence but not shape, and the booking row
 *   is already inserted by the time we get here — so anything Postgres accepted
 *   into a `date` column must still produce a grant. Returning null would drop
 *   the credit AND leave the staff note reading "expires ".
 */
export function b1g1CreditExpiry(bookingDate: string): B1G1Expiry | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/.exec(bookingDate);
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

export interface B1G1EligibilityParams {
  /** The phone on the booking — the one the quote was computed from. */
  phoneNumber: string | null | undefined;
  customerId: string | null | undefined;
  /** The PROFILE id (`public.bookings.user_id`), not the customer id. */
  userId: string | null | undefined;
  /** This booking. Already inserted, so it must be excluded from both checks. */
  bookingId: string;
}

export interface B1G1Eligibility {
  /** The gate. True only when every signal we can read says "new". */
  eligible: boolean;
  /** `is_phone_new_customer`'s raw answer: true, false, or null (no signal). */
  phoneNew: boolean | null;
  /**
   * Whether the PROFILE already has a confirmed booking other than this one.
   * Null when we never got as far as asking.
   */
  profileHasPriorBooking: boolean | null;
  /** Set when a check could not be completed, so the log can say why. */
  error?: string;
}

/**
 * May this booking MINT a free-hour credit?
 *
 * `is_new_customer` from `findOrCreateCustomer` cannot answer that. It means
 * only "no active `customers` row matched this normalized phone, so I created
 * one" — a statement about our customer records, not about the person. It
 * disagrees with the quote the customer actually read in both directions:
 *
 *   * A RETURNING customer who types a phone we have never seen gets a fresh
 *     `customers` row, so `is_new_customer` is true. Their quote showed no
 *     B1G1 (it asks `is_phone_new_customer` with the profile's existing
 *     customer id, which finds the history), yet a second grant would be
 *     written under the NEW customer id — which the partial unique index on
 *     `(customer_id, reason)` cannot catch, because it is keyed per customer.
 *     Repeatable once per fabricated phone number.
 *   * A FIRST-TIME booker whose `customers` row already exists (a course
 *     rental, staff-created in lengolf-forms, an earlier failed attempt) gets
 *     `is_new_customer` false. The quote promised the free hour and the grant
 *     is silently skipped.
 *
 * So the gate is the question the QUOTE asks — `is_phone_new_customer`, the
 * same predicate behind `/api/user/has-bookings` — AND a profile-scoped history
 * check. Both are required:
 *
 *   * The phone predicate alone does not close direction A. Re-running it with
 *     the FRESHLY CREATED customer id still answers true: the new phone has no
 *     bookings, no POS history, and the new customer id has no bookings. It has
 *     to be keyed on something that survives customer-record churn.
 *   * The profile check is that key. `public.bookings.user_id` is the profile
 *     id, and a logged-in person with any prior confirmed booking under their
 *     profile is not a new customer, whatever phone they typed.
 *   * The profile check alone is not enough either: a genuinely new profile
 *     belonging to a customer with POS history or bookings under an old profile
 *     is exactly what `is_phone_new_customer` exists to catch.
 *
 * Both checks EXCLUDE this booking. It is already inserted, with
 * `status = 'confirmed'`, by the time this runs — without the exclusion both
 * checks see the booking currently being made and answer "returning" for
 * everyone, and nobody would ever get a grant.
 *
 * NULL from `is_phone_new_customer` means "no usable signal" (unusable phone
 * with no customer id, or a phone that normalizes away). It is NOT a yes. We
 * deny: this function decides whether to mint financial entitlement that staff
 * in lengolf-forms honour, and minting on no signal is the wrong default. The
 * quote endpoint makes the opposite choice on the same NULL, and that is also
 * right — showing a hint costs nothing, and the disagreement gets logged.
 *
 * Never throws. A booking must never fail over this.
 */
export async function isB1G1GrantEligible(
  supabase: SupabaseClient<Database>,
  { phoneNumber, customerId, userId, bookingId }: B1G1EligibilityParams,
): Promise<B1G1Eligibility> {
  if (!customerId) {
    return { eligible: false, phoneNew: null, profileHasPriorBooking: null, error: 'no customer_id' };
  }
  if (!userId) {
    return { eligible: false, phoneNew: null, profileHasPriorBooking: null, error: 'no user_id' };
  }

  let phoneNew: boolean | null;
  try {
    const { data, error } = await supabase.rpc('is_phone_new_customer', {
      p_phone: phoneNumber ?? null,
      p_customer_id: customerId,
      p_exclude_booking_id: bookingId,
    });
    if (error) {
      return {
        eligible: false,
        phoneNew: null,
        profileHasPriorBooking: null,
        error: `is_phone_new_customer: ${error.message}`,
      };
    }
    phoneNew = (data as boolean | null) ?? null;
  } catch (err) {
    return {
      eligible: false,
      phoneNew: null,
      profileHasPriorBooking: null,
      error: `is_phone_new_customer: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // false = known returning. null = no signal, which we read as "not proven
  // new". Either way there is nothing left to check.
  if (phoneNew !== true) {
    return { eligible: false, phoneNew, profileHasPriorBooking: null };
  }

  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .neq('id', bookingId)
      .limit(1);

    if (error) {
      return {
        eligible: false,
        phoneNew,
        profileHasPriorBooking: null,
        error: `profile booking history: ${error.message}`,
      };
    }

    const profileHasPriorBooking = (data?.length ?? 0) > 0;
    return { eligible: !profileHasPriorBooking, phoneNew, profileHasPriorBooking };
  } catch (err) {
    return {
      eligible: false,
      phoneNew,
      profileHasPriorBooking: null,
      error: `profile booking history: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface B1G1DisagreementContext {
  eligibility: B1G1Eligibility;
  /** `findOrCreateCustomer`'s `is_new_customer`. */
  isNewCustomer: boolean;
  customerId: string | null | undefined;
  userId: string | null | undefined;
  bookingId: string;
}

/**
 * The message to log when the grant predicate and `is_new_customer` disagree,
 * or null when they agree.
 *
 * This is the ONLY way the "promise printed, grant skipped" case ever surfaces.
 * It has to be called OUTSIDE the route's `if (isNewCustomer)` block: every
 * `[B1G1]` line, failures included, used to live inside that block, so a
 * customer whose `customers` row already existed got the promise on their quote,
 * no staff note, no grant and no log — discovered only when they asked for an
 * hour nobody had recorded.
 *
 * Returned rather than logged so the format is pinned by a test; the caller
 * decides the level (error).
 */
export function b1g1DisagreementLog({
  eligibility,
  isNewCustomer,
  customerId,
  userId,
  bookingId,
}: B1G1DisagreementContext): string | null {
  if (eligibility.eligible === isNewCustomer) return null;
  return (
    `[B1G1] New-customer predicates DISAGREE — the quote and the customer record answer differently. ` +
    `grantEligible=${eligibility.eligible} isNewCustomer=${isNewCustomer} ` +
    `customerId=${customerId ?? 'null'} userId=${userId ?? 'null'} bookingId=${bookingId} ` +
    `phoneNew=${eligibility.phoneNew} profileHasPriorBooking=${eligibility.profileHasPriorBooking} ` +
    `error=${eligibility.error ?? 'none'}`
  );
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
 * Note the index is keyed on `(customer_id, reason)`, so it only stops a repeat
 * grant to the SAME customer id. It cannot see a second grant written under a
 * newly created customer record for the same person — that is what
 * `isB1G1GrantEligible` is for, and it must be checked before calling this.
 *
 * `created: false` always carries a real `grantId`: as of
 * 20260726100000 the RPC raises when a conflict happens and the existing row
 * cannot be read back, instead of returning `(null, false)` — a dropped grant
 * reported as ordinary "already held" traffic. That raise arrives here as
 * `ok: false`, which the caller logs at error level.
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
