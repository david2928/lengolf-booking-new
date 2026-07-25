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
import userEvent from '@testing-library/user-event';
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

/**
 * Below `lg` the three cards used to stack into a long scroll. They are now a
 * tab strip. jsdom applies no CSS, so "which card the phone shows" is asserted
 * through the `hidden lg:block` utility the inactive cards carry — that class
 * IS the mechanism, and the desktop grid is untouched underneath it.
 */
const SOCIAL_ONLY = { availableBays: ['Bay 1'], socialBayCount: 1, aiLabCount: 0 };
const AI_ONLY = { availableBays: ['Bay 4'], socialBayCount: 0, aiLabCount: 1 };

const tab = (name: RegExp) => screen.getByRole('tab', { name });
const isHiddenOnMobile = (period: 'morning' | 'afternoon' | 'evening') =>
  card(period).className.includes('hidden lg:block');

describe('mobile period tabs', () => {
  test('one tab per period, each carrying its own count', () => {
    renderWeb([slot('10:00'), slot('10:30'), slot('14:00'), slot('18:00')]);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(tab(/^Morning/)).toHaveAccessibleName('Morning, 2 times available');
    expect(tab(/^Afternoon/)).toHaveAccessibleName('Afternoon, 1 time available');
    expect(tab(/^Evening/)).toHaveAccessibleName('Evening, 1 time available');
  });

  test('only the selected period is shown below lg; all three stay in the desktop grid', () => {
    renderWeb([slot('10:00'), slot('14:00'), slot('18:00')]);
    expect(isHiddenOnMobile('morning')).toBe(false);
    expect(isHiddenOnMobile('afternoon')).toBe(true);
    expect(isHiddenOnMobile('evening')).toBe(true);
    // The desktop layout is deliberately unchanged.
    expect(card('morning').parentElement).toHaveClass('lg:grid-cols-3');
    expect(screen.getByRole('tablist')).toHaveClass('lg:hidden');
  });

  test('tapping a tab swaps the visible period', async () => {
    const user = userEvent.setup();
    renderWeb([slot('10:00'), slot('14:00'), slot('18:00')]);
    await user.click(tab(/^Evening/));
    expect(isHiddenOnMobile('evening')).toBe(false);
    expect(isHiddenOnMobile('morning')).toBe(true);
    expect(tab(/^Evening/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/^Morning/)).toHaveAttribute('aria-selected', 'false');
  });
});

describe('initial tab selection', () => {
  test('defaults to the first period that HAS slots, not to Morning', () => {
    // Morning sold out or already elapsed — the API returns nothing before 14:00.
    renderWeb([slot('14:00'), slot('18:00')]);
    expect(tab(/^Morning/)).toBeDisabled();
    expect(tab(/^Morning/)).toHaveAccessibleName('Morning, no times available');
    expect(tab(/^Afternoon/)).toHaveAttribute('aria-selected', 'true');
    expect(isHiddenOnMobile('afternoon')).toBe(false);
  });

  test('an evening-only date opens on Evening', () => {
    renderWeb([slot('19:00'), slot('19:30')]);
    expect(tab(/^Morning/)).toBeDisabled();
    expect(tab(/^Afternoon/)).toBeDisabled();
    expect(tab(/^Evening/)).toHaveAttribute('aria-selected', 'true');
  });
});

describe('the bay-type filter drives the counts and cannot strand the customer', () => {
  const MIXED = [
    slot('10:00', SOCIAL_ONLY),
    slot('14:00', SOCIAL_ONLY),
    slot('18:00', AI_ONLY),
  ];

  test('counts reflect the filtered set, not every slot on the date', async () => {
    const user = userEvent.setup();
    renderWeb(MIXED);
    expect(tab(/^Evening/)).toHaveAccessibleName('Evening, 1 time available');

    await user.click(screen.getByRole('button', { name: /Social Bays/ }));
    expect(tab(/^Morning/)).toHaveAccessibleName('Morning, 1 time available');
    expect(tab(/^Evening/)).toHaveAccessibleName('Evening, no times available');
    expect(tab(/^Evening/)).toBeDisabled();
  });

  test('a filter that empties the selected tab falls back instead of showing nothing', async () => {
    const user = userEvent.setup();
    renderWeb(MIXED);

    await user.click(tab(/^Evening/));
    expect(isHiddenOnMobile('evening')).toBe(false);

    // Evening is AI-only, so the Social filter wipes it out.
    await user.click(screen.getByRole('button', { name: /Social Bays/ }));
    expect(screen.queryByTestId('period-card-evening')).not.toBeInTheDocument();
    expect(isHiddenOnMobile('morning')).toBe(false);
    expect(tab(/^Morning/)).toHaveAttribute('aria-selected', 'true');

    // Widening the filter again restores the customer's own choice.
    await user.click(screen.getByRole('button', { name: /All Bays/ }));
    expect(isHiddenOnMobile('evening')).toBe(false);
    expect(tab(/^Evening/)).toHaveAttribute('aria-selected', 'true');
  });

  test('when the filter empties the whole date, the existing empty state takes over', async () => {
    const user = userEvent.setup();
    renderWeb([slot('10:00', SOCIAL_ONLY)]);

    await user.click(screen.getByRole('button', { name: /AI Bay/ }));
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByText('No available AI Lab slots for this date.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show All Available Times' })).toBeInTheDocument();
  });

  test('a date with no slots at all keeps the full-width empty state', () => {
    renderWeb([]);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    const message = screen.getByText('No available time slots for this date.');
    expect(message.closest('.lg\\:col-span-3')).toBeInTheDocument();
  });
});

describe('the per-slot treatment survives the tab rewrite', () => {
  test('a maxHours <= 2 slot keeps its amber "limited" caption', () => {
    renderWeb([slot('10:00', { maxHours: 1.5 }), slot('10:30', { maxHours: 3 })]);
    const limited = screen.getByRole('button', { name: /10:00/ });
    expect(limited).toHaveTextContent('1.5hr max');
    expect(limited.className).toContain('border-amber-200');
    const unlimited = screen.getByRole('button', { name: /10:30/ });
    expect(unlimited).not.toHaveTextContent('hr max');
    expect(unlimited.className).toContain('border-gray-200');
  });

  test(':00 and :30 of the same hour stay paired on one row', () => {
    renderWeb([slot('10:00'), slot('10:30'), slot('11:00')]);
    const rows = within(card('morning')).getAllByRole('button');
    expect(rows.map(b => b.textContent)).toEqual(['10:00', '10:30', '11:00']);
    // The pair shares a parent row; the lone 11:00 gets its own.
    const row = (label: string) =>
      screen.getByRole('button', { name: label }).parentElement?.parentElement;
    expect(row('10:00')).toBe(row('10:30'));
    expect(row('11:00')).not.toBe(row('10:00'));
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
