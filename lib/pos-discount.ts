/**
 * Naming the POS discount that pays for an offer.
 *
 * The booking flow's quote is a promise; the money actually leaves through the
 * POS, where a staff member picks a `pos.discounts` row by hand. Which row goes
 * with which flow promotion used to be human convention — fine with one
 * auto-apply offer, unreliable with two. With a single-winner selection
 * (`lib/cost-calculator.ts`) the flow can quote offer A while staff apply offer
 * B and neither side ever finds out.
 *
 * `promotions.pos_discount_id` is the declared pairing, and this module turns it
 * into a sentence in the staff LINE note. The note stops saying "here is the
 * offer, you know the rule" and starts saying "select THIS discount".
 *
 * The title is resolved live rather than copied into the promotions row so that
 * renaming a discount in the POS renames it in the note, instead of leaving
 * staff hunting for a row that no longer exists under that name.
 *
 * Which of the two instructions a booking gets is decided by whether the QUOTE
 * discounted it, never by which promotion won. See
 * `NO_POS_DISCOUNT_INSTRUCTION`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The staff-facing instruction appended to the promo label.
 *
 * Square brackets rather than parentheses because the label it is appended to
 * already uses parentheses for the free-hour expiry, and a staff member
 * skimming a LINE message should be able to see at a glance that these are two
 * separate facts.
 */
export function formatPosDiscountInstruction(title: string): string {
  return `apply POS discount "${title}"`;
}

/** Appends the POS instruction to a promo label, or returns it unchanged. */
export function withPosDiscountInstruction(
  promoLabel: string,
  title: string | null | undefined,
): string {
  const trimmed = title?.trim();
  if (!trimmed) return promoLabel;
  return `${promoLabel} [${formatPosDiscountInstruction(trimmed)}]`;
}

/**
 * The counterpart instruction for a booking the quote did NOT discount.
 *
 * An offer can win the flow's single-offer selection and still charge nothing:
 * a bogo at exactly 1 hour has nothing beyond the paid hour to waive, so it
 * contributes advice only. The staff note still names it, because the customer
 * was shown it — and a named offer with no instruction beside it reads as
 * "apply the usual discount", which is precisely the wrong action. The paired
 * POS row is 100%-off-one-item, and on a 1-hour booking the item IS the whole
 * booking, so a staff member acting on that reading zeroes a booking the
 * customer was quoted in full.
 *
 * One hour is the only duration that reaches here now. The threshold used to be
 * two, so 1.5h landed here as well; it is discounted from 2026-08-03 and takes
 * the ordinary "apply POS discount" instruction instead.
 *
 * Stated as an imperative rather than left to silence. There is no wording that
 * means "no instruction" except an instruction saying so.
 */
export const NO_POS_DISCOUNT_INSTRUCTION = 'do not apply a POS discount to this booking';

/** Appends the "nothing to discount here" instruction to a promo label. */
export function withNoPosDiscountInstruction(promoLabel: string): string {
  return `${promoLabel} [${NO_POS_DISCOUNT_INSTRUCTION}]`;
}

/**
 * The `pos.discounts` title for a declared pairing, or null.
 *
 * Null on every failure path — no id declared, row missing, read failed. A
 * missing title costs the note one clause; it must never cost the note itself,
 * and it must never fall back to printing the raw uuid, which tells a staff
 * member nothing they can act on.
 *
 * Reads `pos` through the service-role client. The schema is exposed to
 * PostgREST and `service_role` holds SELECT on the table; no new grant is
 * introduced here. Never throws.
 */
export async function getPosDiscountTitle(
  supabase: SupabaseClient<never>,
  posDiscountId: string | null | undefined,
): Promise<string | null> {
  if (!posDiscountId) return null;

  try {
    const { data, error } = await supabase
      .schema('pos')
      .from('discounts')
      .select('title')
      .eq('id', posDiscountId)
      .maybeSingle();

    if (error) {
      console.error(
        `[promotions] Could not read the paired POS discount title. posDiscountId=${posDiscountId} error=${error.message}`,
      );
      return null;
    }

    const title = (data as { title?: string | null } | null)?.title;
    if (!title) {
      // A promotion declaring a discount that is not there is a broken pairing,
      // not a quiet no-op — the offer will still be quoted and staff will get
      // no instruction, so say so loudly enough to be found in the logs.
      console.error(
        `[promotions] Promotion declares pos_discount_id=${posDiscountId} but no such POS discount was found.`,
      );
      return null;
    }

    return title;
  } catch (err) {
    console.error(
      `[promotions] Could not read the paired POS discount title. posDiscountId=${posDiscountId}`,
      err,
    );
    return null;
  }
}
