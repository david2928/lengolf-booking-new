/**
 * The in-flow step header for the bay booking flow.
 *
 * What the mockup asks for, and what each group below pins:
 *
 * 1. A segmented progress indicator, filled to the step the customer has
 *    reached.
 * 2. A label/position row — the step name muted on the left, "Step 3 of 3" on
 *    the right — where the POSITION is the accessible equivalent of the bars,
 *    so the bars themselves must stay out of the accessibility tree and the
 *    position must survive a 360px Thai line.
 * 3. A heading that ASKS for what the customer is being asked for right now,
 *    which at step 3 means the current sub-step's question, not the step's.
 * 4. A subline carrying what they have chosen SO FAR, accumulating a segment
 *    per step and never printing a segment the flow has no value for.
 *
 * Plus one thing the mockup does not show and a screenshot cannot check: the
 * back control has to survive, because it is the only way back through step 3's
 * sub-steps.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { BookingStepHeader } from '@/app/[locale]/(features)/bookings/components/booking/BookingStepHeader';
import {
  BAY_BOOKING_STEP_COUNT,
  STEP_HEADER_SUBLINE_SEPARATORS,
  STEP_LABEL_KEYS,
  STEP_QUESTION_KEYS,
  SUB_STEP_QUESTION_KEYS,
  buildStepHeaderSubline,
  stepBarStates,
  stepHeaderSublineFor,
  stepHeaderSublineSeparator,
  stepLabelKey,
  stepQuestionKey,
} from '@/app/[locale]/(features)/bookings/components/booking/stepHeaderModel';
import { bayChoiceLabelKey } from '@/app/[locale]/(features)/bookings/components/booking/steps/details/bayChoice';
import { formatShortDate } from '@/app/[locale]/(features)/bookings/components/booking/steps/details/summarySubline';
import { DETAIL_SUB_STEPS } from '@/app/[locale]/(features)/bookings/components/booking/steps/details/useDetailsSubStep';
import { BAY_BOOKING_STEPS } from '@/lib/booking-telemetry';
import enMessages from '@/messages/en.json';
import thMessages from '@/messages/th.json';
import koMessages from '@/messages/ko.json';
import jaMessages from '@/messages/ja.json';
import zhMessages from '@/messages/zh.json';

const CATALOGS = {
  en: enMessages,
  th: thMessages,
  ko: koMessages,
  ja: jaMessages,
  zh: zhMessages,
} as const;

type Locale = keyof typeof CATALOGS;
const LOCALES = Object.keys(CATALOGS) as Locale[];

/**
 * Wednesday 29 July 2026 at 13:00 — the booking in the mockup.
 *
 * Built from local components rather than an ISO string with an offset: the
 * flow's `selectedDate` is a local `Date` and `formatShortDate` passes no
 * `timeZone`, so an offset-anchored instant renders as the previous day on a CI
 * box west of UTC.
 */
const BOOKING_DATE = new Date(2026, 6, 29, 13, 0);

function renderHeader(
  props: Partial<React.ComponentProps<typeof BookingStepHeader>> = {},
  locale: Locale = 'en',
) {
  const onBack = jest.fn();
  const result = render(
    <NextIntlClientProvider locale={locale} messages={CATALOGS[locale] as never}>
      <BookingStepHeader
        currentStep={3}
        label="Details"
        position="Step 3 of 3"
        question="How long?"
        subline="Wed 29 Jul, from 13:00, Social Bay"
        onBack={onBack}
        backLabel="Go back"
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onBack, ...result };
}

describe('stepBarStates', () => {
  test('fills every bar up to and including the step the customer is on', () => {
    expect(stepBarStates(1)).toEqual([true, false, false]);
    expect(stepBarStates(2)).toEqual([true, true, false]);
    expect(stepBarStates(3)).toEqual([true, true, true]);
  });

  test('always draws one bar per step, so it cannot disagree with the position row', () => {
    for (const step of [1, 2, 3]) {
      expect(stepBarStates(step)).toHaveLength(BAY_BOOKING_STEP_COUNT);
    }
  });

  // Total by construction: a caller that lost track of the step must not be able
  // to produce a short array (bars vanish) or a negative fill (React crash).
  test('clamps a step outside the flow instead of producing a broken row', () => {
    expect(stepBarStates(0)).toEqual([false, false, false]);
    expect(stepBarStates(-4)).toEqual([false, false, false]);
    expect(stepBarStates(9)).toEqual([true, true, true]);
    expect(stepBarStates(0)).toHaveLength(BAY_BOOKING_STEP_COUNT);
    expect(stepBarStates(9)).toHaveLength(BAY_BOOKING_STEP_COUNT);
  });

  test('honours an explicit total, which is how the suite varies it', () => {
    expect(stepBarStates(2, 5)).toEqual([true, true, false, false, false]);
  });
});

/**
 * The header's step count and the funnel's are the same number today. They are
 * deliberately NOT the same constant — `BAY_BOOKING_STEPS` drives the GA4
 * events and must not be edited for a layout reason — so this is the assertion
 * that notices if one moves without the other.
 */
describe('step count', () => {
  test('matches the funnel the telemetry reports against', () => {
    expect(BAY_BOOKING_STEP_COUNT).toBe(BAY_BOOKING_STEPS.length);
  });

  test('the flow still has exactly the three steps the header draws', () => {
    expect(BAY_BOOKING_STEPS).toEqual(['date', 'time', 'details']);
  });
});

describe('stepLabelKey / stepQuestionKey', () => {
  test('name the step the customer is on', () => {
    expect(stepLabelKey(1)).toBe('stepLabelDate');
    expect(stepLabelKey(2)).toBe('stepLabelTime');
    expect(stepLabelKey(3)).toBe('stepLabelDetails');
    expect(stepQuestionKey(1)).toBe('stepDateQuestion');
    expect(stepQuestionKey(2)).toBe('stepTimeQuestion');
    expect(stepQuestionKey(3)).toBe('stepDetailsQuestion');
  });

  test('clamp rather than returning undefined, which would render "undefined"', () => {
    expect(stepLabelKey(0)).toBe('stepLabelDate');
    expect(stepLabelKey(99)).toBe('stepLabelDetails');
    expect(stepQuestionKey(0)).toBe('stepDateQuestion');
    expect(stepQuestionKey(99)).toBe('stepDetailsQuestion');
  });
});

describe('SUB_STEP_QUESTION_KEYS', () => {
  test('asks a question for every sub-step step 3 can be on', () => {
    for (const subStep of DETAIL_SUB_STEPS) {
      expect(SUB_STEP_QUESTION_KEYS[subStep]).toBeTruthy();
    }
    expect(Object.keys(SUB_STEP_QUESTION_KEYS).sort()).toEqual([...DETAIL_SUB_STEPS].sort());
  });
});

/**
 * Five locales, and a missing key renders as the key itself (next-intl's
 * fallback) rather than throwing — so a locale that never got the new strings
 * would ship a header reading "stepDateQuestion" and nothing would have failed.
 */
describe('the header strings exist in all five locales', () => {
  const pageKeys = [...STEP_LABEL_KEYS, ...STEP_QUESTION_KEYS, 'stepPosition', 'sublineFromTime'];
  const detailKeys = Object.values(SUB_STEP_QUESTION_KEYS);

  test.each(LOCALES)('%s', (locale) => {
    const page = CATALOGS[locale].bookings.page as Record<string, string>;
    const details = CATALOGS[locale].bookings.detailsStep as Record<string, string>;

    for (const key of pageKeys) {
      expect(typeof page[key]).toBe('string');
      expect(page[key].trim().length).toBeGreaterThan(0);
    }
    for (const key of detailKeys) {
      expect(typeof details[key]).toBe('string');
      expect(details[key].trim().length).toBeGreaterThan(0);
    }
  });

  test.each(LOCALES)('%s keeps both placeholders in the position row', (locale) => {
    const position = (CATALOGS[locale].bookings.page as Record<string, string>).stepPosition;
    expect(position).toContain('{current}');
    expect(position).toContain('{total}');
  });

  test.each(LOCALES)('%s keeps the time placeholder in the subline fragment', (locale) => {
    const fragment = (CATALOGS[locale].bookings.page as Record<string, string>).sublineFromTime;
    expect(fragment).toContain('{time}');
  });

  /**
   * The pill beside the wordmark, above the step header. It read "Booking",
   * which names a noun the customer is already looking at; the mockup asks it
   * to name the thing they came to do.
   */
  test('the header pill invites the booking rather than labelling the page', () => {
    expect(
      (CATALOGS.en.bookings.layout as Record<string, string>).headerBadge,
    ).toBe('Book a Bay');
  });

  test.each(LOCALES)('%s carries a header pill of its own', (locale) => {
    const badge = (CATALOGS[locale].bookings.layout as Record<string, string>).headerBadge;
    expect(typeof badge).toBe('string');
    expect(badge.trim().length).toBeGreaterThan(0);
    expect(badge).not.toContain('—');
    // Not left in English for the four that are not: the pill is one of the
    // first strings on the page, so an untranslated one is conspicuous.
    if (locale !== 'en') expect(badge).not.toBe('Book a Bay');
  });

  // House rule: no em dashes in user-facing copy.
  test.each(LOCALES)('%s uses no em dash', (locale) => {
    const page = CATALOGS[locale].bookings.page as Record<string, string>;
    const details = CATALOGS[locale].bookings.detailsStep as Record<string, string>;
    for (const key of pageKeys) expect(page[key]).not.toContain('—');
    for (const key of detailKeys) expect(details[key]).not.toContain('—');
  });
});

/**
 * The bay reaches the subline through `bayChoiceLabelKey`, the one mapping every
 * surface that names a bay shares. The header's requirement is that by step 3
 * the bay is ALWAYS known — which only holds because "no preference" is a named
 * answer rather than a gap.
 */
describe('bayChoiceLabelKey', () => {
  test('names each of the three answers, including no preference', () => {
    expect(bayChoiceLabelKey('social')).toBe('socialBay');
    expect(bayChoiceLabelKey('ai_lab')).toBe('aiLab');
    expect(bayChoiceLabelKey(null)).toBe('anyBay');
  });

  test('an absent value is the same answer as an explicit "All Bays"', () => {
    // `selectedBayType` arrives through an optional prop, so `undefined` and
    // `null` are the same customer choice and must not diverge.
    expect(bayChoiceLabelKey(undefined)).toBe(bayChoiceLabelKey(null));
  });

  test('never falls back to Social for an unstated preference', () => {
    // The bug this replaced: anything that was not AI Lab printed "Social Bay",
    // so a booking with no bay preference claimed a Social bay it had not asked
    // for.
    expect(bayChoiceLabelKey(null)).not.toBe('socialBay');
  });

  test.each(LOCALES)('%s can render every bay answer', (locale) => {
    const details = CATALOGS[locale].bookings.detailsStep as Record<string, string>;
    for (const bay of ['social', 'ai_lab', null] as const) {
      const value = details[bayChoiceLabelKey(bay)];
      expect(typeof value).toBe('string');
      expect(value.trim().length).toBeGreaterThan(0);
      expect(value).not.toContain('—');
    }
  });
});

describe('buildStepHeaderSubline', () => {
  test('joins the segments in the order the customer chose them', () => {
    expect(buildStepHeaderSubline(['Wed 29 Jul', 'from 13:00', 'Social Bay'])).toBe(
      'Wed 29 Jul, from 13:00, Social Bay',
    );
  });

  test('joins with whatever separator the locale takes', () => {
    expect(buildStepHeaderSubline(['7月29日(水)', '13:00 から'], '、')).toBe(
      '7月29日(水)、13:00 から',
    );
  });

  // The subline accumulates: step 1 has nothing, step 2 has the date, step 3
  // adds the time and (sometimes) the bay. One code path, not three.
  test('grows a segment at a time as the flow settles them', () => {
    expect(buildStepHeaderSubline([null, null, null])).toBe('');
    expect(buildStepHeaderSubline(['Wed 29 Jul', null, null])).toBe('Wed 29 Jul');
    expect(buildStepHeaderSubline(['Wed 29 Jul', 'from 13:00', null])).toBe(
      'Wed 29 Jul, from 13:00',
    );
  });

  test('drops an unknown middle segment rather than emitting a dangling separator', () => {
    expect(buildStepHeaderSubline(['Wed 29 Jul', undefined, 'Social Bay'])).toBe(
      'Wed 29 Jul, Social Bay',
    );
    expect(buildStepHeaderSubline(['Wed 29 Jul', '   ', 'Social Bay'])).toBe(
      'Wed 29 Jul, Social Bay',
    );
  });
});

/**
 * The wiring the flow actually calls. `buildStepHeaderSubline` proves the first
 * slot leads the line; these prove the DATE is what goes in it, that it is
 * localised, and that the composed line matches the mockup.
 */
describe('stepHeaderSublineFor', () => {
  test('is the short date, the start time and the bay, in that order', () => {
    const actual = stepHeaderSublineFor({
      locale: 'en',
      date: BOOKING_DATE,
      fromTimeLabel: 'from 13:00',
      bayLabel: 'Social Bay',
    });
    expect(actual).toBe(`${formatShortDate('en', BOOKING_DATE)}, from 13:00, Social Bay`);
  });

  /**
   * The mockup's line, end to end. English is composed as `en-GB` so the date
   * reads day-first with no comma of its own, which is what lets the whole
   * subline use a plain comma separator without the date being cut in half by
   * eye.
   */
  test('reads exactly as the mockup draws it', () => {
    expect(
      stepHeaderSublineFor({
        locale: 'en',
        date: BOOKING_DATE,
        fromTimeLabel: 'from 13:00',
        bayLabel: 'Social Bay',
      }),
    ).toBe('Wed 29 Jul, from 13:00, Social Bay');
  });

  test('leads with the DATE, not the start time', () => {
    const subline = stepHeaderSublineFor({
      locale: 'en',
      date: BOOKING_DATE,
      fromTimeLabel: 'from 13:00',
      bayLabel: 'Social Bay',
    });

    expect(subline.startsWith(formatShortDate('en', BOOKING_DATE))).toBe(true);
    expect(subline.indexOf('29')).toBeLessThan(subline.indexOf('13:00'));
    expect(subline.indexOf('Jul')).toBeLessThan(subline.indexOf('Social Bay'));
  });

  test('omits the year, matching the sticky bar it shares a formatter with', () => {
    expect(stepHeaderSublineFor({ locale: 'en', date: BOOKING_DATE })).not.toContain('2026');
  });

  test('renders nothing at all at step 1, where nothing has been chosen', () => {
    expect(stepHeaderSublineFor({ locale: 'en', date: null })).toBe('');
  });

  /**
   * By step 3 the bay is always known, because "All Bays" is a named answer
   * rather than a gap. The three of them are the whole set the subline can end
   * with, and none of them may leave it dangling on the separator.
   */
  test('names the bay for every choice, including no preference', () => {
    for (const bayLabel of ['Social Bay', 'AI Lab', 'Any Bay']) {
      const subline = stepHeaderSublineFor({
        locale: 'en',
        date: BOOKING_DATE,
        fromTimeLabel: 'from 13:00',
        bayLabel,
      });
      expect(subline).toBe(`Wed 29 Jul, from 13:00, ${bayLabel}`);
      expect(subline.endsWith(', ')).toBe(false);
    }
  });

  test('localises the date, so it cannot have been built with a fixed locale', () => {
    const th = stepHeaderSublineFor({
      locale: 'th',
      date: BOOKING_DATE,
      fromTimeLabel: 'เริ่ม 13:00 น.',
      bayLabel: 'Social Bay',
    });
    expect(th).not.toContain('Jul');
    expect(th).not.toContain('Wed');
    // The two segments the caller passes through untouched still arrive.
    expect(th).toContain('เริ่ม 13:00 น.');
    expect(th.endsWith('Social Bay')).toBe(true);
  });

  /**
   * A comma is not one character. An ASCII comma inside a Japanese or Chinese
   * line reads as a Latin intrusion, the same class of detail as the per-locale
   * CJK font stacks in `globals.css`.
   */
  test('sets the separator the way each locale sets it', () => {
    const ja = stepHeaderSublineFor({
      locale: 'ja',
      date: BOOKING_DATE,
      fromTimeLabel: '13:00 から',
    });
    expect(ja).toContain('、');
    expect(ja).not.toContain(', ');

    const zh = stepHeaderSublineFor({
      locale: 'zh',
      date: BOOKING_DATE,
      fromTimeLabel: '13:00 开始',
    });
    expect(zh).toContain('，');
    expect(zh).not.toContain(', ');
  });

  test('falls back to the Latin comma for a locale it does not know', () => {
    expect(stepHeaderSublineSeparator('en')).toBe(', ');
    expect(stepHeaderSublineSeparator('ja')).toBe('、');
    expect(stepHeaderSublineSeparator('de')).toBe(', ');
    expect(stepHeaderSublineSeparator('')).toBe(', ');
  });

  /**
   * Every locale the site ships needs a separator. A `Record<Locale, string>`
   * makes that a typecheck error rather than a runtime fallback, but only while
   * someone keeps using the type. This notices if the map is ever widened.
   */
  test('has a separator for every locale the site ships', () => {
    for (const locale of LOCALES) {
      expect(STEP_HEADER_SUBLINE_SEPARATORS[locale].length).toBeGreaterThan(0);
    }
    expect(Object.keys(STEP_HEADER_SUBLINE_SEPARATORS).sort()).toEqual([...LOCALES].sort());
  });
});

describe('BookingStepHeader', () => {
  test('shows the step name, the position, the question and the booking so far', () => {
    renderHeader();

    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How long?' })).toBeInTheDocument();
    expect(screen.getByText('Wed 29 Jul, from 13:00, Social Bay')).toBeInTheDocument();
  });

  test('draws one bar per step, filled to the current one', () => {
    const { container } = renderHeader({ currentStep: 2 });

    const bars = container.querySelectorAll('span.rounded-full');
    expect(bars).toHaveLength(BAY_BOOKING_STEP_COUNT);
    expect(bars[0]).toHaveClass('bg-green-600');
    expect(bars[1]).toHaveClass('bg-green-600');
    expect(bars[2]).toHaveClass('bg-gray-200');
  });

  /**
   * The bars are decorative BECAUSE the position row states the same fact in
   * words. A `role="progressbar"` here would have a screen reader announce the
   * step twice, once as prose and once as a percentage. If the position row
   * ever stops being rendered, this pair of assertions is what should be
   * revisited — not quietly relaxed.
   */
  test('keeps the bars out of the accessibility tree, which the position row covers', () => {
    const { container } = renderHeader();

    const barRow = container.querySelector('[aria-hidden="true"]');
    expect(barRow).not.toBeNull();
    expect(barRow!.querySelectorAll('span')).toHaveLength(BAY_BOOKING_STEP_COUNT);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    // ...and the textual equivalent really is exposed.
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
  });

  test('the back control survives, keeps its label, and steps backward', async () => {
    const user = userEvent.setup();
    const { onBack } = renderHeader();

    const back = screen.getByRole('button', { name: 'Go back' });
    await user.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test('has no back control on step 1, where there is nowhere to go back to', () => {
    renderHeader({ currentStep: 1, onBack: undefined, subline: undefined });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('omits the subline row entirely when nothing has been chosen yet', () => {
    const { container } = renderHeader({ currentStep: 1, onBack: undefined, subline: '' });
    expect(container.querySelector('header')!.querySelectorAll('p')).toHaveLength(2); // label + position only
  });

  /**
   * Step 3 below `lg:` shows one sub-step and asks its question; above `lg:` all
   * three render at once and no single sub-step question is true. Both headings
   * are in the DOM, gated by `hidden`/`lg:hidden` — `display: none` drops an
   * element from the accessibility tree too, so only one is ever announced.
   */
  test('carries a wide-layout heading alongside the sub-step question', () => {
    renderHeader({ question: 'How long?', questionWide: 'How would you like to play?' });

    const heading = screen.getByRole('heading');
    const narrow = within(heading).getByText('How long?');
    const wide = within(heading).getByText('How would you like to play?');
    expect(narrow).toHaveClass('lg:hidden');
    expect(wide).toHaveClass('hidden');
    expect(wide).toHaveClass('lg:inline');
  });

  test('renders the single heading unwrapped when there is no wide variant', () => {
    renderHeader({ question: 'What time?', questionWide: undefined });

    const heading = screen.getByRole('heading', { name: 'What time?' });
    expect(heading.querySelector('span')).toBeNull();
  });

  /**
   * At 360px the label and the position share one line. The position is the
   * accessible equivalent of the bars, so it is the one that must never wrap or
   * be clipped; the label is the one that gives way. Thai is the longest of the
   * five and is the case this is written against.
   */
  test('protects the position row from a long label rather than the other way round', () => {
    const th = thMessages.bookings.page;
    const { container } = renderHeader(
      {
        label: th.stepLabelDetails,
        position: 'ขั้นตอนที่ 3 จาก 3',
      },
      'th',
    );

    const [label, position] = Array.from(
      container.querySelectorAll('header > div:nth-of-type(2) > p'),
    );
    expect(label).toHaveClass('truncate');
    expect(label).toHaveClass('min-w-0');
    expect(position).toHaveClass('shrink-0');
    expect(position).not.toHaveClass('truncate');
  });
});
