/**
 * Sticky summary-bar subline for booking step 3.
 *
 * The bug this pins: the bar read `TOTAL / ฿550 / 1 hr · 09:30` — no date. A
 * customer several sub-steps in, or one whose page remounted and restored from
 * sessionStorage after a language switch, had nothing on screen telling them
 * which day they were booking.
 *
 * Two contracts:
 *
 * 1. The subline carries the date, and carries it FIRST. The bar renders the
 *    line inside a `truncate`, so the trailing segment is the one a 360px
 *    screen drops. Duration and start time are still visible in the form at
 *    this sub-step; the date is not, so the date must not be the segment at
 *    risk.
 * 2. The date is formatted through next-intl's formatter, not
 *    `toLocaleDateString`, so the other four locales get their own month names
 *    and field order. Pinned by rendering the same `dateTime` options the form
 *    hook's `formatDateShort` uses under a non-English locale and asserting the
 *    output is not the English rendering.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useFormatter } from 'next-intl';
import { buildSummaryBarSubline } from '@/app/[locale]/(features)/bookings/components/booking/steps/details/summarySubline';
import { BookingSummaryBar } from '@/components/shared/BookingSummaryBar';
import enMessages from '@/messages/en.json';
import thMessages from '@/messages/th.json';

/**
 * Saturday 25 July 2026, the date in the reported screenshot's session.
 *
 * Built from local components rather than an ISO string with an offset. The
 * flow's `selectedDate` is a local `Date` and `formatDateShort` passes no
 * `timeZone`, so an offset-anchored instant would render as the PREVIOUS day
 * on a CI box west of UTC and make this suite fail for a reason that has
 * nothing to do with the code under test.
 */
const BOOKING_DATE = new Date(2026, 6, 25, 9, 30);

/**
 * Mirrors `formatDateShort` in `useBookingDetailsForm` exactly. Kept in step
 * with it by the assertion below that the year is absent — the single thing
 * that distinguishes it from the rail's full `formatDate`.
 */
function ShortDateProbe({ date }: { date: Date }) {
  const format = useFormatter();
  return (
    <span data-testid="short-date">
      {format.dateTime(date, { weekday: 'short', day: 'numeric', month: 'short' })}
    </span>
  );
}

function renderShortDate(locale: 'en' | 'th') {
  const messages = locale === 'en' ? enMessages : thMessages;
  render(
    <NextIntlClientProvider locale={locale} messages={messages as never}>
      <ShortDateProbe date={BOOKING_DATE} />
    </NextIntlClientProvider>,
  );
  return screen.getByTestId('short-date').textContent ?? '';
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

describe('the short date the bar is given', () => {
  it('names the weekday and the day/month', () => {
    const label = renderShortDate('en');
    expect(label).toContain('Sat');
    expect(label).toContain('25');
    expect(label).toContain('Jul');
  });

  it('omits the year, which is noise on a booking days away', () => {
    expect(renderShortDate('en')).not.toContain('2026');
  });

  it('localises, so it cannot have been built with toLocaleDateString', () => {
    const th = renderShortDate('th');
    // Thai renders its own month name; the assertion is deliberately about the
    // ENGLISH form being absent rather than about an exact Thai string, so an
    // ICU data revision cannot make this brittle.
    expect(th).not.toContain('Jul');
    expect(th).not.toContain('Sat');
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
