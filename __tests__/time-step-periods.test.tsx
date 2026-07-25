/**
 * Both time steps — the web one and LINE's — must agree on where the morning
 * ends, and the web header must print a span that matches what is under it.
 *
 * The regression this file exists for: a 12:00 / 12:30 slot rendered under
 * "Afternoon (13:00 - 17:00)" on the web (grouped on the server's `period`
 * field, which splits at 12) while the same slot sat under "Morning" on LINE.
 * Both flows now derive the period from the start time via
 * `lib/booking-periods.ts`, so the fixtures below deliberately carry a WRONG
 * server `period` to prove it is ignored.
 */
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { TimeSlot } from '@/app/[locale]/(features)/bookings/hooks/useAvailability';
import messages from '@/messages/en.json';

const mockAvailability = {
  isLoadingSlots: false,
  availableSlots: [] as TimeSlot[],
  fetchAvailability: jest.fn(),
};

jest.mock('@/app/[locale]/(features)/bookings/hooks/useAvailability', () => ({
  useAvailability: () => mockAvailability,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TimeSlots } = require('@/app/[locale]/(features)/bookings/components/booking/steps/TimeSlots');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TimeSlotList = require('@/components/liff/booking/TimeSlotList').default;

/** A weekday on/after the 2026-04-01 opening-hour change, so the venue opens 09:00. */
const DATE = new Date(2026, 6, 15);

/**
 * `period` is set to the value the SQL would emit for a 12:xx slot's *wrong*
 * bucket wherever it matters, so any code that reads it fails loudly.
 */
function slot(startTime: string, overrides: Partial<TimeSlot> = {}): TimeSlot {
  return {
    startTime,
    endTime: '23:00',
    maxHours: 3,
    period: 'evening',
    availableBays: ['Bay 1'],
    socialBayCount: 1,
    aiLabCount: 1,
    totalBayCount: 2,
    ...overrides,
  };
}

function renderWeb(slots: TimeSlot[]) {
  mockAvailability.availableSlots = slots;
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Bangkok">
      <TimeSlots selectedDate={DATE} onBack={jest.fn()} onTimeSelect={jest.fn()} />
    </NextIntlClientProvider>,
  );
}

function card(period: 'morning' | 'afternoon' | 'evening') {
  return screen.getByTestId(`period-card-${period}`);
}

describe('web time step — 12:00 and 12:30 are morning', () => {
  beforeEach(() => {
    renderWeb([slot('11:30'), slot('12:00'), slot('12:30'), slot('13:00'), slot('17:00')]);
  });

  test('noon slots sit in the Morning card', () => {
    const morning = within(card('morning'));
    expect(morning.getByRole('button', { name: /12:00/ })).toBeInTheDocument();
    expect(morning.getByRole('button', { name: /12:30/ })).toBeInTheDocument();
    expect(morning.getByRole('button', { name: /11:30/ })).toBeInTheDocument();
  });

  test('the Afternoon card starts at 13:00 and holds no noon slot', () => {
    const afternoon = within(card('afternoon'));
    expect(afternoon.getByRole('button', { name: /13:00/ })).toBeInTheDocument();
    expect(afternoon.queryByRole('button', { name: /12:/ })).not.toBeInTheDocument();
  });

  test('the server `period` field is ignored', () => {
    // Every fixture claims `period: 'evening'`. Only the 17:00 slot is.
    const evening = within(card('evening'));
    expect(evening.getByRole('button', { name: /17:00/ })).toBeInTheDocument();
    expect(evening.queryByRole('button', { name: /12:00/ })).not.toBeInTheDocument();
    expect(evening.queryByRole('button', { name: /13:00/ })).not.toBeInTheDocument();
  });

  test('each header prints the span its own slots actually fall in', () => {
    // The caption is a sibling span with a CSS margin, so no literal space.
    expect(within(card('morning')).getByRole('heading')).toHaveTextContent(
      /^Morning\s*\(09:00 - 13:00\)$/,
    );
    expect(within(card('afternoon')).getByRole('heading')).toHaveTextContent(
      /^Afternoon\s*\(13:00 - 17:00\)$/,
    );
    expect(within(card('evening')).getByRole('heading')).toHaveTextContent(
      /^Evening\s*\(17:00 - 23:00\)$/,
    );
  });
});

describe('web time step — the morning caption tracks the opening hour', () => {
  test('a pre-2026-04-01 date advertises 10:00, not 09:00', () => {
    mockAvailability.availableSlots = [slot('10:00')];
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Bangkok">
        <TimeSlots selectedDate={new Date(2026, 2, 15)} onBack={jest.fn()} onTimeSelect={jest.fn()} />
      </NextIntlClientProvider>,
    );
    expect(within(card('morning')).getByRole('heading')).toHaveTextContent(
      /^Morning\s*\(10:00 - 13:00\)$/,
    );
  });
});

describe('LIFF time step — same boundary', () => {
  const liffSlot = (time: string) => ({ time, maxHours: 3 });

  beforeEach(() => {
    render(
      <TimeSlotList
        language="en"
        slots={[liffSlot('11:30'), liffSlot('12:00'), liffSlot('12:30'), liffSlot('13:00')]}
        selectedSlot={null}
        onSlotSelect={jest.fn()}
      />,
    );
  });

  test('noon slots count towards Morning', () => {
    // The count span sits immediately after the label.
    expect(screen.getByText('Morning').nextElementSibling).toHaveTextContent('(3)');
    expect(screen.getByText('Afternoon').nextElementSibling).toHaveTextContent('(1)');
  });

  test('Evening renders no header when nothing falls in it', () => {
    expect(screen.queryByText('Evening')).not.toBeInTheDocument();
  });

  test('the morning and afternoon icons are no longer the same sun path', () => {
    const morningPath = screen.getByText('Morning').previousElementSibling?.querySelector('path');
    const afternoonPath = screen.getByText('Afternoon').previousElementSibling?.querySelector('path');
    expect(morningPath?.getAttribute('d')).toBeTruthy();
    expect(afternoonPath?.getAttribute('d')).toBeTruthy();
    expect(morningPath?.getAttribute('d')).not.toBe(afternoonPath?.getAttribute('d'));
  });
});
