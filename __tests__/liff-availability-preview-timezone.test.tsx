/**
 * Slot-filtering contract for the LIFF coaching AvailabilityPreview.
 *
 * The component promises, in its own footer copy, to show only slots "5+ hours
 * from now". It derived today's date by round-tripping through
 * `new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }))` and then
 * calling `.toISOString()` on the result — a double conversion. The first step
 * builds a Date whose *local* fields are Bangkok wall time; the second
 * subtracts the browser's offset all over again. Between 00:00 and 07:00
 * Bangkok that named yesterday, so the real today never matched, the buffer
 * never applied, and the page advertised slots a couple of hours out.
 *
 * These assertions are correct in every zone, but they are NOT a CI safety net
 * for the buffer defect. The double conversion's error is the runtime offset
 * itself, so it self-cancels at UTC: run the old code under TZ=UTC and it
 * returns the right date. The broken version fails this suite on a Bangkok
 * laptop and passes it on a UTC runner. The zone-independent guard for that
 * regression is the source check in `i18n-timezone.test.ts`; what this suite
 * pins is the resulting behaviour — which slots the buffer drops, and that the
 * day labels come out in Bangkok.
 */
import { render, screen } from '@testing-library/react';
import AvailabilityPreview from '@/components/liff/coaching/AvailabilityPreview';

/** 02:00 Bangkok on Jul 30 — still Jul 29 in UTC. Buffer cuts off at 07:00. */
const INSIDE_THE_WINDOW = new Date('2026-07-30T02:00:00+07:00');

const availability = [
  {
    id: 'coach-boss',
    name: 'Boss',
    displayName: 'Boss',
    availability: [
      {
        date: '2026-07-30',
        dayOfWeek: 4,
        // 05:00 is three hours away — inside the buffer, must not be offered.
        // 10:00 is eight hours away — must survive.
        slots: ['05:00', '10:00'],
        isToday: true,
        scheduleStart: '05:00',
        scheduleEnd: '18:00',
      },
      {
        date: '2026-07-31',
        dayOfWeek: 5,
        slots: ['06:00'],
        isToday: false,
        scheduleStart: '06:00',
        scheduleEnd: '18:00',
      },
      {
        // Sunday. The weekday label is built by remapping date-fns' ISO
        // weekday (1..7, Mon..Sun) onto a Sunday-first array with `% 7`, and
        // Sunday is the only day where that wraps — every other day would
        // render correctly even with the remap dropped.
        date: '2026-08-02',
        dayOfWeek: 0,
        slots: ['07:00'],
        isToday: false,
        scheduleStart: '07:00',
        scheduleEnd: '18:00',
      },
    ],
  },
];

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(INSIDE_THE_WINDOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AvailabilityPreview 5-hour buffer', () => {
  it('applies the buffer to the Bangkok today', () => {
    render(<AvailabilityPreview language="en" availability={availability} />);

    expect(screen.queryByText('05:00')).toBeNull();
    expect(screen.queryByText('10:00')).not.toBeNull();
  });

  it('leaves future days unfiltered', () => {
    render(<AvailabilityPreview language="en" availability={availability} />);

    // Same wall-clock hour as the slot dropped above, but tomorrow — proof the
    // buffer is scoped to today rather than applied to every row.
    expect(screen.queryByText('06:00')).not.toBeNull();
  });

  it('labels a day with its Bangkok calendar date', () => {
    render(<AvailabilityPreview language="en" availability={availability} />);

    // `new Date('2026-07-31')` is UTC midnight, and the label was built from
    // that Date's *local* getters — so this reads 30/07 for any viewer at a
    // negative UTC offset. Run this file under `TZ=America/New_York` to see it
    // fail; at a non-negative offset the two forms coincide.
    expect(screen.queryByText(/31\/07/)).not.toBeNull();
  });

  it('names the weekday, wrapping ISO Sunday back to index 0', () => {
    render(<AvailabilityPreview language="en" availability={availability} />);

    // Guards both halves of the remap: `Sun` proves the `% 7` wrap is applied
    // (without it the lookup is `dayNames[7]` → undefined), and `Fri` proves
    // the token is the ISO weekday rather than a locale-dependent one.
    expect(screen.queryByText(/Sun 02\/08/)).not.toBeNull();
    expect(screen.queryByText(/Fri 31\/07/)).not.toBeNull();
  });
});
