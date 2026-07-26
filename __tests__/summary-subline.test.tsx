/**
 * Sticky summary-bar subline for booking step 3.
 *
 * The bug this pins: the bar read `TOTAL / ฿550 / 1 hr · 09:30` — no date. A
 * customer several sub-steps in, or one whose page remounted and restored from
 * sessionStorage after a language switch, had nothing on screen telling them
 * which day they were booking.
 *
 * Three contracts:
 *
 * 1. The subline carries the date, and carries it FIRST. The bar renders the
 *    line inside a `truncate`, so the trailing segment is the one a 360px
 *    screen drops. Duration and start time are still visible in the form at
 *    this sub-step; the date is not, so the date must not be the segment at
 *    risk.
 * 2. The date is formatted through `Intl`, per locale, not with a fixed locale
 *    or a hand-written pattern, so the other four get their own month names and
 *    field order. English is composed as `en-GB` so it reads day-first with no
 *    comma ("Sat 25 Jul"), which is the form the mockup draws; `en`'s own CLDR
 *    short date is "Sat, Jul 25".
 * 3. The DATE reaches the date slot. Contracts 1 and 2 hold for whatever the
 *    caller happens to put there; a call site that passed the start time as the
 *    date would satisfy both. `summaryBarSublineFor` is the whole wiring booking
 *    step 3 uses, so exercising it closes that gap.
 *
 * Note what is deliberately absent: any local restatement of the formatter
 * options. An earlier version of this file defined a probe component that
 * re-implemented `formatDateShort`, which meant swapping the real formatting
 * for `toLocaleDateString` — the exact regression contract 2 exists to catch —
 * left the suite green. `formatShortDate` is a free function and the tests
 * below call it.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import {
  buildSummaryBarSubline,
  formatFlowDate,
  formatShortDate,
  shortDateLocale,
  summaryBarSublineFor,
} from '@/app/[locale]/(features)/bookings/components/booking/steps/details/summarySubline';
import { BookingSummaryBar } from '@/components/shared/BookingSummaryBar';
import enMessages from '@/messages/en.json';

/**
 * Saturday 25 July 2026, the date in the reported screenshot's session.
 *
 * Built from local components rather than an ISO string with an offset. The
 * flow's `selectedDate` is a local `Date` and `formatShortDate` passes no
 * `timeZone`, so an offset-anchored instant would render as the PREVIOUS day
 * on a CI box west of UTC and make this suite fail for a reason that has
 * nothing to do with the code under test.
 */
const BOOKING_DATE = new Date(2026, 6, 25, 9, 30);

describe('buildSummaryBarSubline', () => {
  it('leads with the date, then duration, then start time', () => {
    expect(
      buildSummaryBarSubline({ date: 'Sat 25 Jul', duration: '1 hr', time: '09:30' }),
    ).toBe('Sat 25 Jul · 1 hr · 09:30');
  });

  it('puts the date ahead of both other segments, so truncation never eats it', () => {
    const subline = buildSummaryBarSubline({
      date: 'Sat 25 Jul',
      duration: '1 hr',
      time: '09:30',
    });
    expect(subline.indexOf('Sat 25 Jul')).toBeLessThan(subline.indexOf('1 hr'));
    expect(subline.indexOf('Sat 25 Jul')).toBeLessThan(subline.indexOf('09:30'));
    // And it is the very start of the line, not merely early in it.
    expect(subline.startsWith('Sat 25 Jul')).toBe(true);
  });

  it('drops an empty segment rather than emitting a dangling separator', () => {
    expect(buildSummaryBarSubline({ date: 'Sat 25 Jul', duration: '', time: '09:30' })).toBe(
      'Sat 25 Jul · 09:30',
    );
    expect(buildSummaryBarSubline({ date: '', duration: '1 hr', time: '09:30' })).toBe(
      '1 hr · 09:30',
    );
  });
});

describe('formatShortDate', () => {
  it('names the weekday and the day/month', () => {
    const label = formatShortDate('en', BOOKING_DATE);
    expect(label).toContain('Sat');
    expect(label).toContain('25');
    expect(label).toContain('Jul');
  });

  it('omits the year, which is noise on a booking days away', () => {
    expect(formatShortDate('en', BOOKING_DATE)).not.toContain('2026');
  });

  /**
   * The mockup's form, and the reason English is composed as `en-GB`: `en`'s own
   * CLDR short date is "Sat, Jul 25", month-first with a comma of its own. This
   * is the one assertion in the file that pins an exact arrangement, because
   * the arrangement is the requirement.
   */
  it('puts the day before the month for English, with no comma', () => {
    expect(formatShortDate('en', BOOKING_DATE)).toBe('Sat 25 Jul');
  });

  it('localises, so it cannot have been built with a fixed locale', () => {
    const th = formatShortDate('th', BOOKING_DATE);
    // Thai renders its own month name; the assertion is deliberately about the
    // ENGLISH form being absent rather than about an exact Thai string, so an
    // ICU data revision cannot make this brittle.
    expect(th).not.toContain('Jul');
    expect(th).not.toContain('Sat');
  });

  /**
   * Only English borrows another region's field order. The other four already
   * read correctly in their own, and Japanese, Korean and Chinese would be
   * actively wrong forced into a day-month one.
   */
  it('leaves every other locale composing in its own conventions', () => {
    expect(shortDateLocale('en')).toBe('en-GB');
    for (const locale of ['th', 'ko', 'ja', 'zh']) {
      expect(shortDateLocale(locale)).toBe(locale);
    }
  });

  it('falls back to the default locale rather than throwing on an unknown one', () => {
    expect(shortDateLocale('de')).toBe(shortDateLocale('en'));
    expect(() => formatShortDate('de', BOOKING_DATE)).not.toThrow();
  });

  it('keeps the CJK locales month-first, weekday attached', () => {
    // Not an exact string: ICU data revises. What must hold is that the month
    // marker leads and the weekday does not, which is the opposite of English.
    for (const locale of ['ja', 'zh']) {
      const label = formatShortDate(locale, BOOKING_DATE);
      expect(label.indexOf('7')).toBeLessThan(label.indexOf('25'));
    }
  });
});

/**
 * The full date the rail, the review panel and the Session card print. It shares
 * `formatShortDate`'s locale mapping because on the last sub-step the review
 * panel's Date row and the sticky bar's subline are on screen together.
 */
describe('formatFlowDate', () => {
  /**
   * The alignment that was actually broken was the field ORDER: the rail read
   * "Sat, Jul 25, 2026" while the bar under it read "Sat 25 Jul". Both are
   * day-before-month now. The comma is CLDR's own for `en-GB`'s year form and
   * is left alone: inventing a pattern to remove it is exactly what
   * `SHORT_DATE_LOCALES` exists to avoid.
   */
  it('puts the day before the month, matching the short form', () => {
    expect(formatFlowDate('en', BOOKING_DATE)).toBe('Sat, 25 Jul 2026');
    expect(formatShortDate('en', BOOKING_DATE)).toBe('Sat 25 Jul');
  });

  it('carries the year the short form drops, in every locale', () => {
    for (const locale of ['en', 'th', 'ko', 'ja', 'zh']) {
      // Thai renders the Buddhist year and the CJK locales lead with it; the
      // assertion is only that a year is there, and only here.
      expect(formatShortDate(locale, BOOKING_DATE)).not.toMatch(/\d{4}/);
      expect(formatFlowDate(locale, BOOKING_DATE)).toMatch(/\d{4}/);
    }
  });
});

/**
 * The wiring booking step 3 actually calls. `buildSummaryBarSubline` proves the
 * date slot leads the line; these prove the date is what goes in it.
 */
describe('summaryBarSublineFor', () => {
  /**
   * The expected date is derived from `formatShortDate` rather than written out
   * as a literal: the arrangement is per locale, and pinning one here would make
   * this a test of the CI box's ICU data instead of a test of the wiring. The
   * `formatShortDate` group above owns the one exact-form assertion.
   */
  it('is exactly the short date, the duration and the start time, in that order', () => {
    const actual = summaryBarSublineFor({
      locale: 'en',
      date: BOOKING_DATE,
      durationLabel: '1 hr',
      time: '09:30',
    });
    expect(actual).toBe(`${formatShortDate('en', BOOKING_DATE)} · 1 hr · 09:30`);
  });

  it('leads with the DATE, not the start time', () => {
    const subline = summaryBarSublineFor({
      locale: 'en',
      date: BOOKING_DATE,
      durationLabel: '1 hr',
      time: '09:30',
    });
    // The first segment must be the day, and must not be the clock time — the
    // failure a hand-wired call site produces.
    const [first] = subline.split(' · ');
    expect(first).toContain('25');
    expect(first).toContain('Jul');
    expect(first).not.toContain('09:30');
    expect(subline.indexOf('Jul')).toBeLessThan(subline.indexOf('09:30'));
  });

  it('formats that date in whatever locale is active', () => {
    const th = summaryBarSublineFor({
      locale: 'th',
      date: BOOKING_DATE,
      durationLabel: '1 ชม.',
      time: '09:30',
    });
    expect(th).not.toContain('Jul');
    expect(th).not.toContain('Sat');
    // The two segments the caller passes through untouched still arrive.
    expect(th).toContain('1 ชม.');
    expect(th.endsWith('09:30')).toBe(true);
  });
});

describe('BookingSummaryBar rendering the composed subline', () => {
  it('shows the date on the bar alongside the total', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages as never}>
        <BookingSummaryBar
          total={550}
          totalLabel="Total"
          subline={buildSummaryBarSubline({
            date: 'Sat 25 Jul',
            duration: '1 hr',
            time: '09:30',
          })}
          ctaLabel="Continue"
          onCta={() => {}}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Sat 25 Jul · 1 hr · 09:30')).toBeInTheDocument();
  });
});
