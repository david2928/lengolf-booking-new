import type { useFormatter } from 'next-intl';

/** next-intl's formatter, as `useBookingDetailsForm` already holds it. */
type Formatter = ReturnType<typeof useFormatter>;

/**
 * The booking date, trimmed for the sticky summary bar — which is ONE
 * truncating line on a 360px screen that already carries the duration and start
 * time.
 *
 * Drops the year that the flow's full `formatDate` keeps. The bar exists to
 * orient a customer deep in the flow (or one restored from sessionStorage after
 * a language switch), and the booking is days away: "2026" is the one part of
 * the string that can never be the thing they were unsure about, so it is the
 * first thing to spend truncation budget on. The weekday earns its place for
 * the opposite reason — "is that the Saturday?" is exactly the doubt this line
 * answers.
 *
 * Goes through `formatter.dateTime`, NOT `toLocaleDateString`, so the five
 * locales render their own month names and field order.
 *
 * A free function taking the formatter rather than a closure inside the form
 * hook, so the suite can call this exact code instead of restating the option
 * set in a probe component — a mirror would keep passing after someone swapped
 * the formatter or changed the options, which is the failure it exists to
 * catch.
 */
export function formatShortDate(formatter: Formatter, date: Date): string {
  return formatter.dateTime(date, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Composes the one-line subline under the total in the mobile sticky summary
 * bar (`components/shared/BookingSummaryBar`).
 *
 * Extracted from `BookingDetails` purely so the ordering contract can be
 * pinned by a test — the same reason `IdentityCard` exports its predicates.
 * There is no logic here beyond ordering and joining; the caller supplies
 * already-localised strings. Callers inside the flow go through
 * `summaryBarSublineFor` below rather than calling this directly.
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

/**
 * The subline exactly as booking step 3 builds it: format the date, then order
 * the three segments.
 *
 * This is the whole wiring, so the suite can assert that the DATE reaches the
 * date slot. `buildSummaryBarSubline` on its own only proves that whatever is
 * handed to `date` leads the line; a call site that passed the start time there
 * would satisfy every one of its assertions. Taking a `Date` rather than a
 * string is the other half of that: the start time is a string, so the compiler
 * now rejects the swap this function exists to rule out.
 */
export function summaryBarSublineFor(parts: {
  formatter: Formatter;
  /** The booking's date, unformatted — this function owns the formatting. */
  date: Date;
  /** Localised duration, e.g. "1 hr". */
  durationLabel: string;
  /** Start time in venue-local 24h, e.g. "09:30". */
  time: string;
}): string {
  return buildSummaryBarSubline({
    date: formatShortDate(parts.formatter, parts.date),
    duration: parts.durationLabel,
    time: parts.time,
  });
}
