/**
 * @jest-environment node
 *
 * Date-window contract for GET /api/coaching/availability.
 *
 * This route runs server-side on Vercel, whose runtime zone is **UTC**. It used
 * to derive both the default `from_date` and the `isToday` flag with
 * `new Date().toISOString().split('T')[0]`, which truncates in UTC — so for the
 * ~7 hours between 00:00 and 07:00 Bangkok, every night, it asked the RPC for a
 * window starting *yesterday* and then hung the "Today" label on the wrong row.
 *
 * The clock is faked to sit inside that window. Note this suite would have
 * passed on a Bangkok dev machine even against the broken code — the assertions
 * are on the Bangkok calendar day, which only diverges from the UTC one when
 * the runtime is not Bangkok. That divergence is the bug.
 */
// jest.setup.js mocks next/server with a NextResponse-only stub; this suite
// needs the real NextRequest/NextResponse (available in the node test env).
jest.unmock('next/server');

jest.mock('@/utils/supabase/server', () => ({
  createServerClient: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { GET } from '@/app/api/coaching/availability/route';

const ROUTE_URL = 'http://localhost:3000/api/coaching/availability';

const mockCreateServerClient = createServerClient as unknown as jest.Mock;

/** 02:00 Bangkok on Jul 30 — still Jul 29 in UTC. */
const INSIDE_THE_WINDOW = new Date('2026-07-30T02:00:00+07:00');

function availabilityRow(date: string) {
  return {
    coach_id: 'coach-boss',
    coach_name: 'Boss',
    coach_display_name: 'Boss',
    availability_date: date,
    day_of_week: 4,
    available_slots: ['10:00', '11:00'],
    schedule_start: '10:00',
    schedule_end: '18:00',
  };
}

let rpc: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(INSIDE_THE_WINDOW);

  // Both the day the clock is really on and the day UTC truncation would pick,
  // so a wrong `isToday` shows up as a mislabelled row rather than an absence.
  rpc = jest.fn().mockResolvedValue({
    data: [availabilityRow('2026-07-29'), availabilityRow('2026-07-30')],
    error: null,
  });
  mockCreateServerClient.mockReturnValue({ rpc });
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

async function callRoute(query = '') {
  const response = await GET(new NextRequest(`${ROUTE_URL}${query}`));
  return response.json();
}

describe('GET /api/coaching/availability date window', () => {
  it('defaults from_date to the Bangkok day, not the UTC day', async () => {
    await callRoute();

    expect(rpc).toHaveBeenCalledWith(
      'get_coaching_availability',
      expect.objectContaining({ p_from_date: '2026-07-30' }),
    );
  });

  it('spans `days` calendar days inclusive of from_date', async () => {
    await callRoute('?days=14');

    expect(rpc).toHaveBeenCalledWith(
      'get_coaching_availability',
      // Jul 30 + 13 = Aug 12. A day-early from_date silently shortened the
      // customer-visible window at the far end too.
      expect.objectContaining({ p_from_date: '2026-07-30', p_to_date: '2026-08-12' }),
    );
  });

  it('honours an explicit from_date over the derived one', async () => {
    await callRoute('?from_date=2026-09-01&days=7');

    expect(rpc).toHaveBeenCalledWith(
      'get_coaching_availability',
      expect.objectContaining({ p_from_date: '2026-09-01', p_to_date: '2026-09-07' }),
    );
  });

  it('flags the Bangkok today, not the UTC one', async () => {
    const body = await callRoute();
    const days: Array<{ date: string; isToday: boolean }> = body.coaches[0].availability;

    // The LIFF coaching page renders this flag as the literal word "Today", and
    // AvailabilityPreview keys its 5-hour slot filter off the same row.
    expect(days.find((d) => d.date === '2026-07-30')?.isToday).toBe(true);
    expect(days.find((d) => d.date === '2026-07-29')?.isToday).toBe(false);
  });
});
