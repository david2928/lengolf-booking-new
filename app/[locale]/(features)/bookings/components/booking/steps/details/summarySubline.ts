import { isValidLocale, type Locale } from '@/i18n/routing';

/**
 * The BCP-47 tag each app locale's SHORT date is composed with.
 *
 * Identity for four of the five. English is the exception: `en`'s CLDR short
 * date is month-first and inserts a comma of its own ("Wed, Jul 29"), while the
 * flow reads day-first with no comma ("Wed 29 Jul"). That is not a pattern
 * invented here, it is exactly what `en-GB` already is in CLDR, so the region
 * is borrowed and CLDR still does the composing. Nothing is hand-assembled and
 * no locale is forced into another's field order.
 *
 * The other four are left alone precisely because they must be: Thai is already
 * day-first, and Japanese, Korean and Chinese put the month first with the
 * weekday trailing or parenthesised. Imposing a day-month order on those would
 * produce a date no reader of them writes.
 */
const SHORT_DATE_LOCALES: Record<Locale, string> = {
  en: 'en-GB',
  th: 'th',
  ko: 'ko',
  ja: 'ja',
  zh: 'zh',
};

/** The short-date tag for a locale, falling back to the default locale's. */
export function shortDateLocale(locale: string): string {
  return isValidLocale(locale) ? SHORT_DATE_LOCALES[locale] : SHORT_DATE_LOCALES.en;
}

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
 * Goes through `Intl.DateTimeFormat`, NOT a fixed locale and NOT a hand-written
 * pattern, so all five render their own month names, numerals and field order.
 *
 * It builds its own formatter rather than taking next-intl's because the app
 * locale and the formatting locale deliberately differ for English (see
 * `SHORT_DATE_LOCALES`), and next-intl's formatter is bound to the app locale
 * with no per-call override. Behaviourally identical today: the provider sets
 * NO default `timeZone` (see `i18n/request.ts`, and the note in
 * `CreditBalanceCard`), so both resolve in the runtime's own zone. If a default
 * time zone is ever configured there, this function has to be given one too or
 * it becomes the one date in the flow that ignores it.
 *
 * A free function rather than a closure inside the form hook, so the suite can
 * call this exact code instead of restating the option set in a probe
 * component. A mirror would keep passing after someone changed the options
 * here, which is the failure it exists to catch.
 */
export function formatShortDate(locale: string, date: Date): string {
  return new Intl.DateTimeFormat(shortDateLocale(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

/**
 * The same date with the year, for the step-3 surfaces that have room for it:
 * the Session recap card, the desktop `SummaryRail` and the mobile
 * `BookingReviewPanel`.
 *
 * Shares `shortDateLocale` with `formatShortDate` deliberately. On the last
 * sub-step the review panel's "Date" row and the sticky bar's subline sit about
 * 100px apart on the same screen, and while the two resolved their field order
 * separately the flow printed one booking's date two ways at once: "Wed 29 Jul"
 * under "Wed, Jul 29, 2026", month-first above day-first.
 *
 * They agree on ORDER, not character for character: CLDR gives `en-GB`'s year
 * form a comma after the weekday ("Sat, 25 Jul 2026") that its short form does
 * not have. That is the locale's own convention for the two shapes and is left
 * alone, for the same reason nothing here is hand-assembled.
 */
export function formatFlowDate(locale: string, date: Date): string {
  return new Intl.DateTimeFormat(shortDateLocale(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
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
  /** Short localised date, e.g. "Sat 25 Jul". */
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
  /** The active locale, which picks the short-date tag. `useLocale()` at the call site. */
  locale: string;
  /** The booking's date, unformatted — this function owns the formatting. */
  date: Date;
  /** Localised duration, e.g. "1 hr". */
  durationLabel: string;
  /** Start time in venue-local 24h, e.g. "09:30". */
  time: string;
}): string {
  return buildSummaryBarSubline({
    date: formatShortDate(parts.locale, parts.date),
    duration: parts.durationLabel,
    time: parts.time,
  });
}
