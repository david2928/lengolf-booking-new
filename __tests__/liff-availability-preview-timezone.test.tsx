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
 * The assertions below are zone-independent: `toISOString()` truncates in UTC
 * no matter where the browser is, so the broken code fails this suite on a
 * Bangkok laptop as well as on CI.
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
    // that Date's *local* getters — so this reads 30/07 for any viewer west of
    // UTC. Run this file under `TZ=America/New_York` to see it fail; under
    // TZ=UTC the two forms coincide and only the buffer tests above bite.
    expect(screen.queryByText(/31\/07/)).not.toBeNull();
  });
});
