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
 * 2. The date is formatted through next-intl's formatter, not
 *    `toLocaleDateString`, so the other four locales get their own month names
 *    and field order.
 * 3. The DATE reaches the date slot. Contracts 1 and 2 hold for whatever the
 *    caller happens to put there; a call site that passed the start time as the
 *    date would satisfy both. `summaryBarSublineFor` is the whole wiring booking
 *    step 3 uses, so exercising it closes that gap.
 *
 * Note what is deliberately absent: any local restatement of the formatter
 * options. An earlier version of this file defined a probe component that
 * re-implemented `formatDateShort`, which meant swapping `formatter.dateTime`
 * for `toLocaleDateString` — the exact regression contract 2 exists to catch —
 * left the suite green. `formatShortDate` is now a free function and the tests
 * below call it.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useFormatter } from 'next-intl';
import {
  buildSummaryBarSubline,
  formatShortDate,
  summaryBarSublineFor,
} from '@/app/[locale]/(features)/bookings/components/booking/steps/details/summarySubline';
import { BookingSummaryBar } from '@/components/shared/BookingSummaryBar';
import enMessages from '@/messages/en.json';
import thMessages from '@/messages/th.json';

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

/**
 * Runs `render` under a locale and hands the test the REAL formatter, so the
 * assertions below exercise the shipped code rather than a copy of it.
 * `useFormatter` is a hook, so it has to be read from inside a component.
 */
function withFormatter(locale: 'en' | 'th', use: (formatter: ReturnType<typeof useFormatter>) => string) {
  function Probe() {
    return <span data-testid="out">{use(useFormatter())}</span>;
  }
  const messages = locale === 'en' ? enMessages : thMessages;
  render(
    <NextIntlClientProvider locale={locale} messages={messages as never}>
      <Probe />
    </NextIntlClientProvider>,
  );
  return screen.getByTestId('out').textContent ?? '';
}

describe('buildSummaryBarSubline', () => {
  it('leads with the date, then duration, then start time', () => {
    expect(
      buildSummaryBarSubline({ date: 'Sat, 25 Jul', duration: '1 hr', time: '09:30' }),
    ).toBe('Sat, 25 Jul · 1 hr · 09:30');
  });

  it('puts the date ahead of both other segments, so truncation never eats it', () => {
    const subline = buildSummaryBarSubline({
      date: 'Sat, 25 Jul',
      duration: '1 hr',
      time: '09:30',
    });
    expect(subline.indexOf('Sat, 25 Jul')).toBeLessThan(subline.indexOf('1 hr'));
    expect(subline.indexOf('Sat, 25 Jul')).toBeLessThan(subline.indexOf('09:30'));
    // And it is the very start of the line, not merely early in it.
    expect(subline.startsWith('Sat, 25 Jul')).toBe(true);
  });

  it('drops an empty segment rather than emitting a dangling separator', () => {
    expect(buildSummaryBarSubline({ date: 'Sat, 25 Jul', duration: '', time: '09:30' })).toBe(
      'Sat, 25 Jul · 09:30',
    );
    expect(buildSummaryBarSubline({ date: '', duration: '1 hr', time: '09:30' })).toBe(
      '1 hr · 09:30',
    );
  });
});

describe('formatShortDate', () => {
  it('names the weekday and the day/month', () => {
    const label = withFormatter('en', (f) => formatShortDate(f, BOOKING_DATE));
    expect(label).toContain('Sat');
    expect(label).toContain('25');
    expect(label).toContain('Jul');
  });

  it('omits the year, which is noise on a booking days away', () => {
    expect(withFormatter('en', (f) => formatShortDate(f, BOOKING_DATE))).not.toContain('2026');
  });

  it('localises, so it cannot have been built with toLocaleDateString', () => {
    const th = withFormatter('th', (f) => formatShortDate(f, BOOKING_DATE));
    // Thai renders its own month name; the assertion is deliberately about the
    // ENGLISH form being absent rather than about an exact Thai string, so an
    // ICU data revision cannot make this brittle.
    expect(th).not.toContain('Jul');
    expect(th).not.toContain('Sat');
  });
});

/**
 * The wiring booking step 3 actually calls. `buildSummaryBarSubline` proves the
 * date slot leads the line; these prove the date is what goes in it.
 */
describe('summaryBarSublineFor', () => {
  /**
   * The expected date is derived from `formatShortDate` rather than written out
   * as a literal: ICU orders the day and month per locale ("Sat, Jul 25" under
   * `en`), and pinning one arrangement would make this a test of the CI box's
   * ICU data instead of a test of the wiring.
   */
  it('is exactly the short date, the duration and the start time, in that order', () => {
    const subline = withFormatter('en', (formatter) =>
      [
        summaryBarSublineFor({
          formatter,
          date: BOOKING_DATE,
          durationLabel: '1 hr',
          time: '09:30',
        }),
        formatShortDate(formatter, BOOKING_DATE),
      ].join('\n'),
    );
    const [actual, shortDate] = subline.split('\n');
    expect(actual).toBe(`${shortDate} · 1 hr · 09:30`);
  });

  it('leads with the DATE, not the start time', () => {
    const subline = withFormatter('en', (formatter) =>
      summaryBarSublineFor({
        formatter,
        date: BOOKING_DATE,
        durationLabel: '1 hr',
        time: '09:30',
      }),
    );
    // The first segment must be the day, and must not be the clock time — the
    // failure a hand-wired call site produces.
    const [first] = subline.split(' · ');
    expect(first).toContain('25');
    expect(first).toContain('Jul');
    expect(first).not.toContain('09:30');
    expect(subline.indexOf('Jul')).toBeLessThan(subline.indexOf('09:30'));
  });

  it('formats that date through next-intl, in whatever locale is active', () => {
    const th = withFormatter('th', (formatter) =>
      summaryBarSublineFor({
        formatter,
        date: BOOKING_DATE,
        durationLabel: '1 ชม.',
        time: '09:30',
      }),
    );
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
            date: 'Sat, 25 Jul',
            duration: '1 hr',
            time: '09:30',
          })}
          ctaLabel="Continue"
          onCta={() => {}}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Sat, 25 Jul · 1 hr · 09:30')).toBeInTheDocument();
  });
});
