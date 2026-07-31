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
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { BayType } from '@/lib/bayConfig';
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

// `jest.mock` above is hoisted over these by babel-jest, so plain ESM imports
// still get the mocked hook — and keep both components properly typed.
import { TimeSlots } from '@/app/[locale]/(features)/bookings/components/booking/steps/TimeSlots';
import TimeSlotList from '@/components/liff/booking/TimeSlotList';

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

/**
 * What the step reported to its caller. The bay choice is owned by
 * `useBookingFlow`, not by `TimeSlots`: step 2 unmounts on the way to step 3
 * and remounts on the way back, so a component-local choice could not survive
 * the trip — and the choice is what the booking is made with, so it has to
 * leave the component. Recording it here lets a test assert that it does,
 * rather than only that the component re-rendered itself.
 */
let lastBayType: BayType | null | undefined;
const onTimeSelect = jest.fn();

/** Holds the bay choice exactly as the flow hook does. */
function ControlledTimeSlots({ date }: { date: Date }) {
  const [bayType, setBayType] = useState<BayType | null>(null);
  return (
    <TimeSlots
      selectedDate={date}
      bayType={bayType}
      onBayTypeChange={(next) => {
        lastBayType = next;
        setBayType(next);
      }}
      onBack={jest.fn()}
      onTimeSelect={onTimeSelect}
    />
  );
}

function renderWeb(slots: TimeSlot[], date: Date = DATE) {
  mockAvailability.availableSlots = slots;
  lastBayType = undefined;
  onTimeSelect.mockClear();
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Bangkok">
      <ControlledTimeSlots date={date} />
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
    renderWeb([slot('10:00')], new Date(2026, 2, 15));
    expect(within(card('morning')).getByRole('heading')).toHaveTextContent(
      /^Morning\s*\(10:00 - 13:00\)$/,
    );
  });
});

/**
 * Below `lg` the three cards used to stack into a long scroll. They are now
 * driven by a period filter strip. jsdom applies no CSS, so "which card the
 * phone shows" is asserted through the `hidden lg:block` utility the inactive
 * cards carry — that class IS the mechanism, and the desktop grid is untouched
 * underneath it.
 *
 * The strip is a toggle GROUP, not an ARIA tablist: at `lg` all three cards
 * render at once, so they are not tab panels and `role="tabpanel"` would be
 * false half the time. The assertions below pin `role="group"` +
 * `aria-pressed`, and pin that an empty period stays reachable by keyboard
 * (`aria-disabled`, never the native `disabled` attribute, which would hide
 * its count from the very users who cannot see it greyed out).
 */
const SOCIAL_ONLY = { availableBays: ['Bay 1'], socialBayCount: 1, aiLabCount: 0 };
const AI_ONLY = { availableBays: ['Bay 4'], socialBayCount: 0, aiLabCount: 1 };

const periodStrip = () => screen.getByRole('group', { name: 'Time of day' });
const periodButton = (name: RegExp) => within(periodStrip()).getByRole('button', { name });
const isHiddenOnMobile = (period: 'morning' | 'afternoon' | 'evening') =>
  card(period).className.includes('hidden lg:block');

describe('mobile period strip', () => {
  test('one button per period, each carrying its own count', () => {
    renderWeb([slot('10:00'), slot('10:30'), slot('14:00'), slot('18:00')]);
    expect(within(periodStrip()).getAllByRole('button')).toHaveLength(3);
    expect(periodButton(/^Morning/)).toHaveAccessibleName('Morning, 2 times available');
    expect(periodButton(/^Afternoon/)).toHaveAccessibleName('Afternoon, 1 time available');
    expect(periodButton(/^Evening/)).toHaveAccessibleName('Evening, 1 time available');
  });

  test('the strip is a toggle group, not a tablist', () => {
    renderWeb([slot('10:00'), slot('14:00'), slot('18:00')]);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryAllByRole('tablist')).toHaveLength(0);
    // No `aria-controls` either — there is nothing with `role="tabpanel"` to
    // point at, and at `lg` the cards are not panels at all.
    for (const button of within(periodStrip()).getAllByRole('button')) {
      expect(button).not.toHaveAttribute('aria-controls');
      expect(button).not.toHaveAttribute('aria-selected');
    }
  });

  test('only the selected period is shown below lg; all three stay in the desktop grid', () => {
    renderWeb([slot('10:00'), slot('14:00'), slot('18:00')]);
    expect(isHiddenOnMobile('morning')).toBe(false);
    expect(isHiddenOnMobile('afternoon')).toBe(true);
    expect(isHiddenOnMobile('evening')).toBe(true);
    // The desktop layout is deliberately unchanged.
    expect(card('morning').parentElement).toHaveClass('lg:grid-cols-3');
    expect(periodStrip()).toHaveClass('lg:hidden');
  });

  test('tapping a period swaps the visible card', async () => {
    const user = userEvent.setup();
    renderWeb([slot('10:00'), slot('14:00'), slot('18:00')]);
    await user.click(periodButton(/^Evening/));
    expect(isHiddenOnMobile('evening')).toBe(false);
    expect(isHiddenOnMobile('morning')).toBe(true);
    expect(periodButton(/^Evening/)).toHaveAttribute('aria-pressed', 'true');
    expect(periodButton(/^Morning/)).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('initial period selection', () => {
  test('defaults to the first period that HAS slots, not to Morning', () => {
    // Morning sold out or already elapsed — the API returns nothing before 14:00.
    renderWeb([slot('14:00'), slot('18:00')]);
    expect(periodButton(/^Morning/)).toHaveAttribute('aria-disabled', 'true');
    expect(periodButton(/^Morning/)).toHaveAccessibleName('Morning, no times available');
    expect(periodButton(/^Afternoon/)).toHaveAttribute('aria-pressed', 'true');
    expect(isHiddenOnMobile('afternoon')).toBe(false);
  });

  test('an evening-only date opens on Evening', () => {
    renderWeb([slot('19:00'), slot('19:30')]);
    expect(periodButton(/^Morning/)).toHaveAttribute('aria-disabled', 'true');
    expect(periodButton(/^Afternoon/)).toHaveAttribute('aria-disabled', 'true');
    expect(periodButton(/^Evening/)).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('an empty period stays reachable but inert', () => {
  test('it keeps the native disabled attribute OFF so it stays in the tab order', () => {
    renderWeb([slot('14:00')]);
    const morning = periodButton(/^Morning/);
    // `toBeDisabled()` would pass on `aria-disabled` too, so assert the
    // attribute directly — the tab order is what is at stake.
    expect(morning).not.toHaveAttribute('disabled');
    morning.focus();
    expect(morning).toHaveFocus();
  });

  test('activating it changes nothing', async () => {
    const user = userEvent.setup();
    renderWeb([slot('14:00'), slot('18:00')]);
    await user.click(periodButton(/^Morning/));
    expect(periodButton(/^Morning/)).toHaveAttribute('aria-pressed', 'false');
    expect(periodButton(/^Afternoon/)).toHaveAttribute('aria-pressed', 'true');
    expect(isHiddenOnMobile('afternoon')).toBe(false);
    expect(screen.queryByTestId('period-card-morning')).not.toBeInTheDocument();
  });
});

/**
 * The bay control is the CHOICE, made once here and carried to the booking —
 * the same single `bayPreference` the LIFF flow has always had. Narrowing the
 * slot list is a consequence of the choice, not its purpose, so this group
 * covers both halves: what the customer sees, and what leaves the component.
 */
describe('the bay-type choice drives the counts and cannot strand the customer', () => {
  const MIXED = [
    slot('10:00', SOCIAL_ONLY),
    slot('14:00', SOCIAL_ONLY),
    slot('18:00', AI_ONLY),
  ];

  test('the choice is reported to the flow rather than kept inside the step', async () => {
    const user = userEvent.setup();
    renderWeb(MIXED);
    expect(lastBayType).toBeUndefined();

    await user.click(screen.getByRole('button', { name: /Social Bays/ }));
    expect(lastBayType).toBe('social');

    await user.click(screen.getByRole('button', { name: /AI Bay/ }));
    expect(lastBayType).toBe('ai_lab');

    // "All Bays" is a real answer — no preference — and reports as `null`, not
    // as the absence of a report. The booking is made with it.
    await user.click(screen.getByRole('button', { name: /All Bays/ }));
    expect(lastBayType).toBeNull();
  });

  test('the control states which bay is chosen, so it reads as an answer', async () => {
    const user = userEvent.setup();
    renderWeb(MIXED);
    const group = screen.getByRole('group', { name: 'Bay Type' });
    const pressed = () =>
      within(group)
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.textContent);

    // Exactly one at a time, starting on the permissive default.
    expect(pressed()).toEqual(['All Bays']);
    await user.click(screen.getByRole('button', { name: /Social Bays/ }));
    expect(pressed()).toEqual(['Social BaysSocial']);
  });

  test('picking a time reports the slot only — the bay is already the flow\'s', async () => {
    const user = userEvent.setup();
    renderWeb(MIXED);
    await user.click(screen.getByRole('button', { name: /Social Bays/ }));
    await user.click(screen.getByRole('button', { name: /10:00/ }));

    // Three arguments, and no bay among them. A fourth `bayType` argument was
    // the old second source of truth for the same choice.
    const args = onTimeSelect.mock.calls[0];
    expect(args).toHaveLength(3);
    expect(args[0]).toBe('10:00');
    expect(args[1]).toBe(3);
    expect(args[2]).toMatchObject({ startTime: '10:00' });
    expect(args).not.toContain('social');
  });

  test('counts reflect the chosen bay, not every slot on the date', async () => {
    const user = userEvent.setup();
    renderWeb(MIXED);
    expect(periodButton(/^Evening/)).toHaveAccessibleName('Evening, 1 time available');

    await user.click(screen.getByRole('button', { name: /Social Bays/ }));
    expect(periodButton(/^Morning/)).toHaveAccessibleName('Morning, 1 time available');
    expect(periodButton(/^Evening/)).toHaveAccessibleName('Evening, no times available');
    expect(periodButton(/^Evening/)).toHaveAttribute('aria-disabled', 'true');
  });

  test('a choice that empties the selected period falls back instead of showing nothing', async () => {
    const user = userEvent.setup();
    renderWeb(MIXED);

    await user.click(periodButton(/^Evening/));
    expect(isHiddenOnMobile('evening')).toBe(false);

    // Evening is AI-only, so choosing Social wipes it out.
    await user.click(screen.getByRole('button', { name: /Social Bays/ }));
    expect(screen.queryByTestId('period-card-evening')).not.toBeInTheDocument();
    expect(isHiddenOnMobile('morning')).toBe(false);
    expect(periodButton(/^Morning/)).toHaveAttribute('aria-pressed', 'true');

    // Widening the choice again restores the customer's own period.
    await user.click(screen.getByRole('button', { name: /All Bays/ }));
    expect(isHiddenOnMobile('evening')).toBe(false);
    expect(periodButton(/^Evening/)).toHaveAttribute('aria-pressed', 'true');
  });

  test('when the choice empties the whole date, the existing empty state takes over', async () => {
    const user = userEvent.setup();
    renderWeb([slot('10:00', SOCIAL_ONLY)]);

    await user.click(screen.getByRole('button', { name: /AI Bay/ }));
    expect(screen.queryByRole('group', { name: 'Time of day' })).not.toBeInTheDocument();
    expect(screen.getByText('No available AI Lab slots for this date.')).toBeInTheDocument();

    // The way out reports the widened choice like any other, so the flow (and
    // therefore the booking) never keeps a bay the customer has backed out of.
    await user.click(screen.getByRole('button', { name: 'Show All Available Times' }));
    expect(lastBayType).toBeNull();
    expect(screen.getByRole('group', { name: 'Time of day' })).toBeInTheDocument();
  });

  test('a date with no slots at all keeps the full-width empty state', () => {
    renderWeb([]);
    expect(screen.queryByRole('group', { name: 'Time of day' })).not.toBeInTheDocument();
    const message = screen.getByText('No available time slots for this date.');
    expect(message.closest('.lg\\:col-span-3')).toBeInTheDocument();
  });
});

describe('the per-slot treatment survives the tab rewrite', () => {
  test('a maxHours <= 2 slot keeps its amber "limited" caption', () => {
    renderWeb([slot('10:00', { maxHours: 1.5 }), slot('10:30', { maxHours: 3 })]);
    const limited = screen.getByRole('button', { name: /10:00/ });
    expect(limited).toHaveTextContent('1.5 hr max');
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
