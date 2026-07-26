import { isValidLocale, type Locale } from '@/i18n/routing';
import { formatShortDate } from './steps/details/summarySubline';
import { DETAIL_SUB_STEPS, type DetailSubStep } from './steps/details/useDetailsSubStep';

/**
 * PROGRESS IS A DISPLAY MODEL, NOT THE FUNNEL.
 * ---------------------------------------------------------------------------
 * Everything in this block describes what the customer is SHOWN. None of it may
 * be derived from, or fed back into, `BAY_BOOKING_STEPS` in
 * `lib/booking-telemetry`. That array names the GA4 funnel events and is read by
 * dashboards whose value is comparability with history, so it stays
 * `['date','time','details']` no matter what the header draws.
 *
 * The two are now deliberately DIFFERENT numbers below `lg:`, and that is the
 * point: the funnel measures three server-meaningful stages, the header counts
 * the screens a thumb actually swipes through. Conflating them is what produced
 * the bug this replaces — "Step 3 of 3" with a full bar, shown to someone on the
 * third of five screens.
 */

/**
 * How many bars the progress indicator draws at `lg:` and up, and the `total`
 * the wide position row prints.
 *
 * Above `lg:` step 3 renders all of its sub-steps at once, so a screen really is
 * a step and three is the honest count.
 *
 * Deliberately a local constant rather than `BAY_BOOKING_STEPS.length`:
 * importing that would make a header layout change look like a safe edit to a
 * file whose real job is analytics. The two happening to be 3 is checked by a
 * test instead, which fails loudly if they ever diverge.
 */
export const BAY_BOOKING_STEP_COUNT = 3;

/**
 * How many bars the indicator draws below `lg:`, and the `total` the narrow
 * position row prints.
 *
 * Below `lg:` step 3 is split across `DETAIL_SUB_STEPS`, one screen at a time,
 * so the customer traverses date, time and then each sub-step: five screens.
 *
 * DERIVED, not typed as 5, and this is load-bearing: `DETAIL_SUB_STEPS` is the
 * array `useDetailsSubStep` navigates, so adding or removing a sub-step there
 * moves the header's count with it. A literal 5 would leave the bars silently
 * disagreeing with the screens the very next time that array changed. A test
 * pins today's value at 5 so the derivation cannot quietly drift either.
 */
export const BAY_BOOKING_SCREEN_COUNT =
  BAY_BOOKING_STEP_COUNT - 1 + DETAIL_SUB_STEPS.length;

/**
 * The `bookings.page` key naming each step in the header's label row — "DATE",
 * "TIME", "DETAILS". Small caps and muted; it says WHERE the customer is.
 *
 * Indexed by step number minus one. `as const` is load-bearing: next-intl types
 * `t()` against the key union, so a widened `string[]` would not typecheck at
 * the call site.
 */
export const STEP_LABEL_KEYS = ['stepLabelDate', 'stepLabelTime', 'stepLabelDetails'] as const;

/**
 * The `bookings.page` key asking each step's question — the large heading.
 *
 * Steps 1 and 2 always use theirs. Step 3 uses `stepDetailsQuestion` ONLY at
 * `lg:` and up, where all three of its sub-steps are on screen at once and no
 * single sub-step question would be true; below `lg:` the heading is the current
 * sub-step's question from `SUB_STEP_QUESTION_KEYS`.
 */
export const STEP_QUESTION_KEYS = [
  'stepDateQuestion',
  'stepTimeQuestion',
  'stepDetailsQuestion',
] as const;

/**
 * The `bookings.detailsStep` key asking each step-3 sub-step's question.
 *
 * Lives here rather than beside `SUB_STEP_LABEL_KEYS` in `useDetailsSubStep`
 * because that module owns sub-step NAVIGATION, which this rework does not
 * touch. Keyed by `DetailSubStep` so adding a sub-step there is a typecheck
 * error here rather than a missing heading at runtime.
 */
export const SUB_STEP_QUESTION_KEYS = {
  session: 'subStepSessionQuestion',
  extras: 'subStepExtrasQuestion',
  contact: 'subStepContactQuestion',
} as const satisfies Record<DetailSubStep, string>;

/**
 * The step-3 sub-step that states the date, the start time and the bay itself,
 * on the slot chip at the top of its panel.
 *
 * Named here rather than inlined at the one call site so the coupling is
 * findable from both ends: whoever moves the chip has to come here, and whoever
 * changes this can see what depends on it.
 */
export const SUB_STEP_WITH_SLOT_CHIP: DetailSubStep = 'session';

/**
 * Whether the header must stay silent about what the customer has chosen so far.
 *
 * THE RULE. The subline and the session sub-step's slot chip carry the SAME
 * three facts — the date, the start time and the bay — so exactly one of them
 * may be on screen at a time. The chip is the one that keeps its place, because
 * between two identical lines the ACTIONABLE one wins: the chip's "Change"
 * returns the customer to the step those facts were decided on, and the subline
 * is a line of text with nothing on it to press.
 *
 * WHY THE SUBLINE IS NOT SIMPLY DROPPED. It came from the owner's own mockup
 * and they liked it, and it is still the only thing carrying these facts on four
 * of the flow's five screens: step 2 (the date), and step 3's extras and contact
 * sub-steps, where the chip is not rendered and the collapsed Session summary
 * carries the duration and party size only. So it yields on exactly one screen —
 * the one where it was being said twice, which is the duplication the owner
 * flagged twice — and holds everywhere it is the only voice.
 *
 * The alternative was to shorten one of the two, which is worse than either:
 * splitting three facts across two rows at the top of the same screen is what
 * the previous arrangement already did (header: date, time, bay; recap cards:
 * date, time, bay) and is how a customer ends up reading the same booking twice
 * to work out whether the two rows agree.
 *
 * Takes the sub-step unconditionally rather than an optional one, so a caller on
 * step 1 or 2 cannot forget it and get a `false` that happens to be right: the
 * step check is what makes those steps safe, and it is checked here rather than
 * assumed.
 */
export function stepHeaderSublineSuppressed(step: number, subStep: DetailSubStep): boolean {
  return clampStep(step) === BAY_BOOKING_STEP_COUNT && subStep === SUB_STEP_WITH_SLOT_CHIP;
}

/**
 * What separates the subline's segments: "Wed 29 Jul, from 13:00, Social Bay".
 *
 * A comma rather than the sticky bar's middle dot. The bar's line is a row of
 * peer facts read at a glance; this one is a sentence fragment describing a
 * single booking, and the two sit about a screen apart, so telling them apart
 * is worth more than matching them.
 *
 * Per locale, because a comma is not one character. Japanese sets it as the
 * ideographic `、` and Chinese as the fullwidth `，`; an ASCII comma in a CJK
 * line reads as a Latin intrusion, the same class of detail as the per-locale
 * font stacks in `globals.css`. Korean and Thai both take the Latin comma.
 *
 * A code map and not a message key: the value is a punctuation mark whose
 * significant part is a trailing space that is invisible in a JSON diff, so it
 * is exactly the kind of string a translation pass silently eats.
 *
 * The composed line is still not safely splittable on this separator, and
 * nothing may parse it. `en` used to render its short date as "Wed, Jul 29",
 * putting a comma inside the date segment; `formatShortDate` now composes that
 * one as `en-GB` ("Wed 29 Jul"), so no shipped locale does today. That is a
 * property of the current date format, not a guarantee about future segments.
 * The line is read, never re-read by code. Do not add a caller that splits it.
 */
export const STEP_HEADER_SUBLINE_SEPARATORS: Record<Locale, string> = {
  en: ', ',
  th: ', ',
  ko: ', ',
  ja: '、',
  zh: '，',
};

/** The separator for a locale, falling back to the Latin comma. */
export function stepHeaderSublineSeparator(locale: string): string {
  return isValidLocale(locale) ? STEP_HEADER_SUBLINE_SEPARATORS[locale] : ', ';
}

/**
 * Which of the three progress bars are filled at a given step.
 *
 * A step is filled once the customer has REACHED it, so the current step reads
 * as filled rather than as the one still to do — the bars answer "how far in am
 * I", which is also what the position row says in words.
 *
 * Total by construction: an out-of-range step clamps instead of producing a
 * short array or a negative fill, so a future caller cannot make the indicator
 * disagree with the position row it sits above.
 */
export function stepBarStates(
  currentStep: number,
  total: number = BAY_BOOKING_STEP_COUNT,
): boolean[] {
  const reached = Math.min(Math.max(Math.round(currentStep), 0), total);
  return Array.from({ length: total }, (_, index) => index < reached);
}

/** Clamps a step number onto the 1..`BAY_BOOKING_STEP_COUNT` range. */
function clampStep(step: number): number {
  return Math.min(Math.max(Math.round(step), 1), BAY_BOOKING_STEP_COUNT);
}

/**
 * Where the customer is in the NARROW five-screen walk: date, time, then one
 * screen per step-3 sub-step.
 *
 * Steps 1 and 2 are one screen each and keep their own number. Step 3 is where
 * the two models come apart: it starts at screen 3 and advances one screen per
 * sub-step, so `session` is 3, `extras` is 4 and `contact` is 5.
 *
 * Reads the sub-step INDEX rather than its name so it stays a pure arithmetic
 * function of `DETAIL_SUB_STEPS` order — the same order `nextSubStep` and
 * `prevSubStep` walk, which is why the number always matches the screen.
 *
 * Both arguments are clamped. A caller that lost track of either must not be
 * able to print "Step 7 of 5" or drive `stepBarStates` past its total.
 */
export function narrowStepFor(step: number, subStepIndex: number): number {
  const clamped = clampStep(step);
  if (clamped < BAY_BOOKING_STEP_COUNT) return clamped;

  const sub = Math.min(
    Math.max(Math.round(subStepIndex) || 0, 0),
    DETAIL_SUB_STEPS.length - 1,
  );
  return BAY_BOOKING_STEP_COUNT + sub;
}

/** The `bookings.page` label key for a step, clamped to the steps that exist. */
export function stepLabelKey(step: number): (typeof STEP_LABEL_KEYS)[number] {
  return STEP_LABEL_KEYS[clampStep(step) - 1];
}

/** The `bookings.page` question key for a step, clamped to the steps that exist. */
export function stepQuestionKey(step: number): (typeof STEP_QUESTION_KEYS)[number] {
  return STEP_QUESTION_KEYS[clampStep(step) - 1];
}

/**
 * Joins the subline's segments, dropping the ones that are not yet known.
 *
 * The subline is accumulated context — what the customer has chosen SO FAR — so
 * it grows a segment per step: nothing at step 1, the date at step 2, the date
 * plus start time plus bay at step 3. Dropping empties rather than joining them
 * is what makes that one code path instead of three: a segment the flow has no
 * value for simply is not printed, and no dangling separator can appear.
 */
export function buildStepHeaderSubline(
  segments: ReadonlyArray<string | null | undefined>,
  separator: string = STEP_HEADER_SUBLINE_SEPARATORS.en,
): string {
  return segments
    .filter((segment): segment is string => typeof segment === 'string' && segment.trim().length > 0)
    .map((segment) => segment.trim())
    .join(separator);
}

/**
 * The subline exactly as the booking flow builds it.
 *
 * The whole wiring, so the suite can assert that the DATE reaches the date slot
 * and reaches it FIRST. `buildStepHeaderSubline` on its own only proves that
 * whatever is handed to the first slot leads the line; a call site that passed
 * the start time there would satisfy every one of its assertions. Taking a
 * `Date` rather than a string is the other half of that — the start time is a
 * string, so the compiler rejects the swap.
 *
 * Formatting goes through `formatShortDate`, the same function the sticky
 * summary bar uses, so the two surfaces cannot print the same booking's date in
 * two different shapes.
 */
export function stepHeaderSublineFor(parts: {
  /**
   * The active locale, which picks both the separator and the short-date tag.
   * `useLocale()` at the call site.
   */
  locale: string;
  /** The booking's date, unformatted — this function owns the formatting. */
  date: Date | null;
  /** Already-localised start time, e.g. "from 13:00". Null before step 3. */
  fromTimeLabel?: string | null;
  /**
   * Already-localised bay name, e.g. "Social Bay". Null whenever the bay is not
   * yet a settled choice — see the call site in `page.tsx`.
   */
  bayLabel?: string | null;
}): string {
  return buildStepHeaderSubline(
    [
      parts.date ? formatShortDate(parts.locale, parts.date) : null,
      parts.fromTimeLabel,
      parts.bayLabel,
    ],
    stepHeaderSublineSeparator(parts.locale),
  );
}
