'use client';

import { useTranslations } from 'next-intl';

/**
 * The booking-email consent disclosure, rendered adjacent to the confirm action.
 *
 * WHAT IT SAYS, AND WHAT IT NO LONGER SAYS
 *
 * One sentence: "By booking, you agree to receive booking status updates and a
 * post-visit review email." It used to come in two variants, the second of which
 * appended "Marketing emails are separate and use the opt-in above." That clause
 * was meta-commentary about an adjacent control rather than a statement about
 * the booking, and the checkbox it pointed at already carries "You can
 * unsubscribe any time from any email" in its own description 20px away.
 * Proximity does that work, so the clause is gone and `consentNoteWithOptIn` is
 * gone from all five catalogs with it. Do not reintroduce a variant: a
 * disclosure that explains the form is a disclosure the reader stops reading.
 *
 * WHY IT LIVES UNDER THE CONFIRM BUTTON
 *
 * It opens "By booking, you agree" — it is a statement about the ACT of
 * booking, so it belongs against the control that performs that act, which is
 * also where checkout flows conventionally put it. It previously sat at the
 * bottom of the contact form section, which on desktop left it in the left
 * column while Confirm was in the right one.
 *
 * EXACTLY ONE INSTANCE AT EVERY BREAKPOINT
 *
 * There are three confirm-ish surfaces in booking step 3, and the note must
 * appear once, next to whichever one the customer will actually press:
 *
 *   1. `SummaryRail`'s Confirm  — desktop. Mounted in an aside classed
 *      `hidden lg:block`, and its button is ALWAYS confirm (desktop shows every
 *      sub-step at once, so there is nothing to advance through). The note
 *      renders directly beneath that button, with no visibility class of its
 *      own — it inherits the aside's.
 *   2. `BookingSummaryBar`'s CTA — mobile, `fixed` to the bottom. The note is
 *      the last block of scroll content on the contact sub-step, so it sits
 *      immediately above this bar. Tagged `lg:hidden` at that call site.
 *   3. The mobile review panel above (2) — carries facts and money, no action.
 *
 * `hidden lg:block` and `lg:hidden` are exact complements of one breakpoint
 * (min-width: 1024px): below it only the mobile copy renders, at or above it
 * only the rail copy does. No viewport shows both, and none shows neither.
 *
 * The mobile copy stays inside `YourDetailsStep` rather than being hoisted next
 * to the bar, and that is load-bearing: `YourDetailsStep` only renders on the
 * `contact` sub-step, so the note inherits "last sub-step only" for free. On the
 * `session` and `extras` sub-steps the bar's CTA reads "Continue", and a consent
 * statement must not attach to a button that does not consent to anything.
 * Hoisting it would mean re-deriving that condition in a second place, free to
 * drift from the real one.
 *
 * NOT INSIDE `BookingSummaryBar`. It is tempting — it is the literal confirm on
 * mobile — and it is wrong three times over: the bar is shared with the
 * course-rental flow via `RentalPriceSummaryBar` and would leak a bay-booking
 * disclosure into it; it is `fixed`, and its height is a contract with the
 * exported `BOOKING_SUMMARY_BAR_SPACER` (`pb-28`) that a wrapping sentence would
 * silently break; and it renders on every sub-step, including the "Continue"
 * ones.
 *
 * IT ALWAYS RENDERS
 *
 * No prop removes it, including for customers who have booked before. It was
 * asked whether returning customers need to see it again. They do:
 *
 *   1. It is a terms-acceptance disclosure attached to the ACT of booking. It
 *      makes a claim about THIS booking, and a consent record is weaker if the
 *      disclosure was only ever shown once, months ago, on some earlier one.
 *   2. There is no honest signal to gate on. The nearest thing is
 *      `isNewCustomer` in `useBookingDetailsForm`, which is not even returned
 *      from the hook, starts `false` (meaning "returning"), and is only
 *      corrected by a debounced fetch needing eight digits of phone number to
 *      fire at all. Gating on it would hide the disclosure by default for
 *      EVERYONE, including genuine first-timers, and permanently for anyone
 *      whose phone never validates — silently, one-way, landing on exactly the
 *      people it most needs to reach.
 *   3. It is a promotions-eligibility predicate, so gating on it would let a
 *      change to the B1G1 rule silently change what customers are told.
 *
 * The complaint behind the question was real — noise for someone who has booked
 * twenty times — and dropping the marketing clause is what answers it. The note
 * is now one short sentence instead of two, and it is somewhere it earns its
 * place. Shortening beat hiding.
 *
 * CONTRAST FLOOR
 *
 * `text-gray-500` (~4.8:1 on white), not `text-gray-400` (2.5:1, under the 4.5:1
 * WCAG AA wants at 12px). The instinct when a disclosure feels repetitive is to
 * fade it; that is the one direction that costs something, and a test in
 * `__tests__/marketing-opt-in.test.tsx` pins the floor. Quiet is fine — 12px,
 * centred, last. Illegible is not.
 */
export function ConsentNote({ className }: { className?: string }) {
  const t = useTranslations('bookings.detailsStep');

  return (
    <p className={['text-xs text-gray-500 text-center', className].filter(Boolean).join(' ')}>
      {t('consentNote')}
    </p>
  );
}
