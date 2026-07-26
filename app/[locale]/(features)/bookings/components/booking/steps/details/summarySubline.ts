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

/** Weekday, day and month. The sticky bar's form. */
const SHORT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
};

/** The same, plus the year, for the surfaces with room for it. */
const FLOW_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  ...SHORT_DATE_OPTIONS,
  year: 'numeric',
};

/**
 * Built formatters, keyed by tag plus options.
 *
 * `new Intl.DateTimeFormat(...)` costs roughly 85µs against ~1.7µs for a
 * `format()` on a built one, and these are called from `BookingDetails`, which
 * re-renders on every keystroke in the contact form. There are exactly two
 * option sets and five locales, so the map is bounded at ten entries and lives
 * for the life of the module. Formatters are stateless across `format()` calls,
 * so sharing one is safe.
 */
const FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(tag: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${tag}|${JSON.stringify(options)}`;
  const cached = FORMATTER_CACHE.get(key);
  if (cached) return cached;
  const built = new Intl.DateTimeFormat(tag, options);
  FORMATTER_CACHE.set(key, built);
  return built;
}

/**
 * Format, or degrade to the raw value on a date that is not a date.
 *
 * `Intl.DateTimeFormat.prototype.format(new Date(NaN))` THROWS
 * `RangeError: Invalid time value`. next-intl's `dateTime` wraps that and
 * returns `String(value)`, so before these helpers took the formatting over,
 * a corrupt date rendered the literal "Invalid Date" and the flow kept going.
 * Calling `Intl` directly reinstated the throw — and reinstated it in the step
 * header in `page.tsx`, which sits ABOVE `BookingDetails`, so one bad value
 * takes down the entire booking flow instead of one card.
 *
 * A NaN date is reachable: `useBookingFlow` restores `new Date(s.selectedDateIso)`
 * from a sessionStorage snapshot without re-validating it (the NaN guard is on
 * the write side only), so a corrupt or cross-version snapshot lands here.
 *
 * `String(date)` rather than a translated placeholder on purpose: this is a
 * corrupt-state fallback, not copy. It is the exact string next-intl produced,
 * it needs no key in five locales, and it stays recognisable in a bug report.
 */
function formatOrRaw(
  locale: string,
  options: Intl.DateTimeFormatOptions,
  date: Date,
): string {
  if (Number.isNaN(date.getTime())) return String(date);
  return dateFormatter(shortDateLocale(locale), options).format(date);
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
  return formatOrRaw(locale, SHORT_DATE_OPTIONS, date);
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
  return formatOrRaw(locale, FLOW_DATE_OPTIONS, date);
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
 * The one-line recap inside the SLOT CHIP at the top of the session sub-step:
 * the date, the start time and the bay, with a "Change" that leaves step 3 for
 * step 2.
 *
 * WHAT IT REPLACED. Three stacked cards, roughly 240px of a phone screen, each
 * one an icon and a heading and a value: "Selected Date / Sun, 26 Jul 2026",
 * "Start Time / 20:30", "Bay Type / Any Bay". Every fact on them was already in
 * the step header's subline two rows above — the owner's second complaint about
 * the same duplication — and none of them led anywhere, even though all three
 * were decided on earlier steps that the customer could no longer see a way
 * back to.
 *
 * WHY THE HEADER YIELDS RATHER THAN THIS. The subline and this chip carry the
 * same three facts, so exactly one of them may be on screen at a time, and the
 * chip is the one that keeps its place: between two identical lines the
 * ACTIONABLE one wins. The subline is untouched everywhere it is the only
 * carrier — steps 1 and 2, and the extras and contact sub-steps, where this chip
 * is not rendered. See `stepHeaderSublineSuppressed` in `stepHeaderModel.ts`,
 * which is where that rule lives and is enforced.
 *
 * SO THE SEPARATOR IS NOT THE HEADER'S. The subline joins with a locale-aware
 * comma because it reads as a sentence fragment about one booking. This is a
 * chip: a row of peer facts read at a glance, sharing a border and a fill with
 * the collapsed sub-step summaries below it, which use the middle dot. It is
 * drawn as one of those, so it is punctuated as one of those.
 *
 * The date goes through `formatShortDate` — the year-less form, the same
 * function the subline it stands in for uses — rather than `formatFlowDate`.
 * The cards printed "Sun, 26 Jul 2026"; a booking days away has no doubt in it
 * that "2026" answers, and the row has three facts and two controls to fit.
 */
export function buildSlotChipValue(parts: {
  /** Short localised date, e.g. "Sun 26 Jul". */
  date: string;
  /** Start time in venue-local 24h, e.g. "20:30". */
  time: string;
  /** Already-localised bay name, including the "Any Bay" case. */
  bayLabel: string;
}): string {
  return [parts.date, parts.time, parts.bayLabel]
    .filter((segment) => segment.trim().length > 0)
    .join(' · ');
}

/**
 * The slot chip's line exactly as the session sub-step builds it: format the
 * date, then order the three segments.
 *
 * The whole wiring, so the suite can assert that the DATE reaches the date slot
 * and reaches it first — `buildSlotChipValue` alone only proves that whatever is
 * handed to `date` leads. Taking a `Date` rather than a string is the other half
 * of that: the start time is a string, so the compiler rejects the swap.
 *
 * Ordering matches the header subline it replaces and the sticky bar's line,
 * for the same reason both of those lead with the date: it is the segment a
 * customer deep in the flow cannot recover from anything else on screen.
 */
export function slotChipValueFor(parts: {
  /** The active locale, which picks the short-date tag. `useLocale()` at the call site. */
  locale: string;
  /** The booking's date, unformatted — this function owns the formatting. */
  date: Date;
  /** Start time in venue-local 24h, e.g. "20:30". */
  time: string;
  /** Already-localised bay name. */
  bayLabel: string;
}): string {
  return buildSlotChipValue({
    date: formatShortDate(parts.locale, parts.date),
    time: parts.time,
    bayLabel: parts.bayLabel,
  });
}

/**
 * The one-line recap inside the COLLAPSED Session sub-step summary, the row
 * carrying the "Change" affordance back to that sub-step.
 *
 * WHAT IS NOT HERE IS THE POINT. This row used to read
 * "Session · 1 hr · Any Bay · 1 person" directly under a step header whose
 * subline read "Sun 26 Jul, from 20:30, Any Bay". Owner: the booking facts are
 * stated twice at the top, state them once.
 *
 * "Twice" was really "split across two places with one overlap", which is worse
 * than either: the header had the date, the start time and the bay; this row had
 * the duration, the bay and the party size. Only the BAY appeared in both.
 *
 * The split is now drawn where the decisions are made, which puts every fact in
 * exactly one place:
 *
 *   header subline   what steps 1 and 2 settled   date, start time, BAY
 *   this row         what the session sub-step settled   duration, party size
 *
 * The bay stays with the header because that is where it is CHOSEN — the bay
 * control lives on the time step, and this sub-step only ever recapped it. A row
 * whose job is "here is what you set here, tap to change it" should not list a
 * value that tapping it cannot change.
 *
 * So: do not add the bay back, and do not add the date or the start time. If a
 * future header stops naming the bay, this is the function that has to gain it,
 * and the test that pins the pairing is what will say so.
 *
 * The slot chip above did NOT trigger that clause, and the reason is worth
 * stating because it looks like it should have. The header now falls silent on
 * the session sub-step, where the chip states all three facts instead — but this
 * row is rendered only once the customer has LEFT the session sub-step, i.e.
 * exactly where the chip is not on screen and the subline is back. The pairing
 * holds unchanged: wherever this row appears, the header above it still names
 * the date, the start time and the bay.
 *
 * The separator is the literal " · " the caller's other segments use, not a
 * margin: a margin-only gap matched visually but not textually, and screen
 * readers and copy/paste got "Session·1 hr".
 */
export function buildSessionSummaryValue(parts: {
  /** Localised duration, e.g. "1 hr". Same string as the sticky bar's subline. */
  durationLabel: string;
  /**
   * Localised party size WITH its unit, e.g. "1 person". The unit is required
   * here: this row has no field label, and a bare "· 1" said nothing about what
   * the 1 counted.
   */
  peopleLabel: string;
}): string {
  return [parts.durationLabel, parts.peopleLabel]
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
