/**
 * Composes the one-line subline under the total in the mobile sticky summary
 * bar (`components/shared/BookingSummaryBar`).
 *
 * Extracted from `BookingDetails` purely so the ordering contract can be
 * pinned by a test — the same reason `IdentityCard` exports its predicates.
 * There is no logic here beyond ordering and joining; the caller supplies
 * already-localised strings (the date via `formatDateShort` from the form
 * hook, so it goes through next-intl's formatter rather than
 * `toLocaleDateString`).
 *
 * Order is load-bearing. The bar renders this inside a `truncate`, so the LAST
 * segment is what a 360px screen or a long localised month name drops first.
 * The date leads because it is the segment a customer deep in the flow — or
 * one restored from sessionStorage after a language switch remounted the page
 * — cannot recover from anything else on screen. Duration and start time are
 * still shown by the form itself at this point; the date is not.
 *
 * Empty segments are dropped rather than joined, so a not-yet-resolved value
 * can never render a dangling separator.
 */
export function buildSummaryBarSubline(parts: {
  /** Short localised date, e.g. "Sat, 26 Jul". */
  date: string;
  /** Localised duration, e.g. "1 hr". */
  duration: string;
  /** Start time in venue-local 24h, e.g. "09:30". */
  time: string;
}): string {
  return [parts.date, parts.duration, parts.time]
    .filter((segment) => segment.trim().length > 0)
    .join(' · ');
}
