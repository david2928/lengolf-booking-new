/**
 * @jest-environment node
 *
 * Package-expiry boundary for GET /api/liff/booking/user.
 *
 * The route picks the customer's active simulator package with
 * `pkg.expiration_date >= today`. `today` came from
 * `new Date().toISOString().split('T')[0]`, which truncates in UTC — so on
 * Vercel, between 00:00 and 07:00 Bangkok, it read as yesterday and the
 * comparison ran a day loose: a package that expired the previous day was still
 * offered in the LIFF booking flow.
 *
 * Customer-favourable, so nobody was ever going to report it. Pinned here
 * because the same derivation was wrong in three places and only this one was
 * cheap to miss.
 */
jest.unmock('next/server');

jest.mock('@/utils/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}));

jest.mock('@/lib/cache', () => ({
  appCache: { get: jest.fn(() => null), set: jest.fn() },
}));

import { NextRequest } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { GET } from '@/app/api/liff/booking/user/route';

const ROUTE_URL = 'http://localhost:3000/api/liff/booking/user?lineUserId=U-test';

/** 02:00 Bangkok on Jul 30 — still Jul 29 in UTC. */
const INSIDE_THE_WINDOW = new Date('2026-07-30T02:00:00+07:00');

const PROFILE = {
  id: 'profile-1',
  display_name: 'Test Customer',
  email: 'test@example.com',
  phone_number: '0800000000',
  customer_id: 'customer-1',
};

const CUSTOMER = {
  id: 'customer-1',
  customer_code: 'CUS-1',
  customer_name: 'Test Customer',
  email: 'test@example.com',
  contact_number: '0800000000',
  preferred_language: 'en',
};

function simulatorPackage(expirationDate: string) {
  return {
    package_id: 'pkg-1',
    display_name: 'Gold (30h)',
    package_type_name: 'Gold',
    package_category: 'simulator',
    expiration_date: expirationDate,
    remaining_hours: 12,
  };
}

/** Chainable stub that resolves to `result` at whatever depth the route stops. */
function queryStub(result: { data: unknown; error: null }) {
  const stub: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of ['select', 'eq', 'maybeSingle', 'single']) {
    stub[method] = () => stub;
  }
  return stub;
}

function mockSupabase(packages: unknown[]) {
  (createAdminClient as unknown as jest.Mock).mockReturnValue({
    from: (table: string) =>
      queryStub({ data: table === 'profiles' ? PROFILE : CUSTOMER, error: null }),
    rpc: jest.fn().mockResolvedValue({ data: packages, error: null }),
  });
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(INSIDE_THE_WINDOW);
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

async function activePackage(packages: unknown[]) {
  mockSupabase(packages);
  const response = await GET(new NextRequest(ROUTE_URL));
  return (await response.json()).activePackage;
}

describe('GET /api/liff/booking/user package expiry', () => {
  it('drops a package that expired on the previous Bangkok day', async () => {
    expect(await activePackage([simulatorPackage('2026-07-29')])).toBeNull();
  });

  it('keeps a package expiring on the current Bangkok day', async () => {
    // The boundary is inclusive — expiry day is still a usable day.
    expect(await activePackage([simulatorPackage('2026-07-30')])).toEqual(
      expect.objectContaining({ id: 'pkg-1', remainingHours: 12 }),
    );
  });

  it('keeps a package expiring later', async () => {
    expect(await activePackage([simulatorPackage('2026-08-15')])).toEqual(
      expect.objectContaining({ id: 'pkg-1' }),
    );
  });
});
