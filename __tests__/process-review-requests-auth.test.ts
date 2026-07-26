/**
 * @jest-environment node
 *
 * Cron-auth forwarding contract for POST /api/notifications/process-review-requests.
 *
 * PR #107 put `Authorization: Bearer ${CRON_API_KEY}` auth on the downstream
 * email/LINE review-request routes, and this route — the production cron chain
 * (pg_cron → process-review-requests → email/line) — must forward that bearer
 * on its two internal fetch calls. If a refactor drops those headers, review
 * requests silently 401 in prod and age out of the ±10-minute processing
 * window with no retry (rows linger at sent=false). This suite is the CI guard
 * for that contract.
 */
// jest.setup.js mocks next/server with a NextResponse-only stub; this suite
// needs the real NextRequest/NextResponse (available in the node test env).
jest.unmock('next/server');

jest.mock('@/utils/supabase/server', () => ({
  createServerClient: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { POST } from '@/app/api/notifications/process-review-requests/route';

const ROUTE_URL = 'http://localhost:3000/api/notifications/process-review-requests';
const CRON_KEY = 'test-cron-api-key-0123456789abcdef';

const mockCreateServerClient = createServerClient as unknown as jest.Mock;

// user_id: null makes the route skip the profiles/customers name lookups.
const BOOKING_ROW = {
  id: 'BK-TEST-1',
  name: 'Test Customer',
  email: 'test@example.com',
  user_id: null,
  language: 'en',
};

interface DueRequestRow {
  id: string;
  booking_id: string;
  provider: 'email' | 'line';
  contact_info: string;
  scheduled_time: string;
  sent: boolean;
}

function dueRequest(provider: 'email' | 'line'): DueRequestRow {
  return {
    id: `srr-${provider}-1`,
    booking_id: BOOKING_ROW.id,
    provider,
    contact_info: provider === 'email' ? 'test@example.com' : 'U-test-line-user',
    scheduled_time: new Date().toISOString(),
    sent: false,
  };
}

type QueryResult = { data: unknown; error: null; count?: number };

interface QueryStub extends PromiseLike<QueryResult> {
  select(columns?: string, opts?: { count?: string; head?: boolean }): QueryStub;
  update(values: Record<string, unknown>): QueryStub;
  eq(column: string, value: unknown): QueryStub;
  gte(column: string, value: unknown): QueryStub;
  lte(column: string, value: unknown): QueryStub;
  order(column: string, opts?: { ascending?: boolean }): QueryStub;
  limit(count: number): QueryStub;
  single(): QueryStub;
}

/**
 * Minimal chainable PostgREST stub. Every filter/modifier returns the builder;
 * awaiting it resolves a result picked by table + what was chained:
 * head-count selects → { count }, bookings → the booking row, update chains →
 * success (the route only reads `error`), scheduled_review_requests list
 * selects → the due rows.
 */
function stubSupabase(dueRows: DueRequestRow[]) {
  return {
    from(table: string): QueryStub {
      const state = { countOnly: false, update: false };
      const result = (): QueryResult => {
        if (state.countOnly) return { data: null, error: null, count: dueRows.length };
        if (table === 'bookings') return { data: BOOKING_ROW, error: null };
        if (state.update) return { data: null, error: null };
        if (table === 'scheduled_review_requests') return { data: dueRows, error: null };
        return { data: null, error: null };
      };
      const builder: QueryStub = {
        select(_columns?: string, opts?: { count?: string; head?: boolean }) {
          if (opts?.head) state.countOnly = true;
          return builder;
        },
        update(_values: Record<string, unknown>) {
          state.update = true;
          return builder;
        },
        eq: () => builder,
        gte: () => builder,
        lte: () => builder,
        order: () => builder,
        limit: () => builder,
        single: () => builder,
        then(onFulfilled, onRejected) {
          return Promise.resolve(result()).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest(ROUTE_URL, { method: 'POST', headers });
}

describe('POST /api/notifications/process-review-requests cron auth', () => {
  const originalCronKey = process.env.CRON_API_KEY;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.CRON_API_KEY = CRON_KEY;
    mockCreateServerClient.mockReset();
    mockCreateServerClient.mockReturnValue(stubSupabase([]));
    // Fresh Response per call — a shared instance would throw on the second
    // body read when a batch contains more than one due request.
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  afterAll(() => {
    if (originalCronKey === undefined) delete process.env.CRON_API_KEY;
    else process.env.CRON_API_KEY = originalCronKey;
  });

  it('rejects a wrong bearer token without touching the database or notifying', async () => {
    const res = await POST(makeRequest({ Authorization: 'Bearer not-the-key' }));
    expect(res.status).toBe(401);
    expect(mockCreateServerClient).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forwards the cron bearer on the internal email review-request fetch', async () => {
    mockCreateServerClient.mockReturnValue(stubSupabase([dueRequest('email')]));

    const res = await POST(makeRequest({ Authorization: `Bearer ${CRON_KEY}` }));

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/notifications/email/review-request'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${CRON_KEY}` }),
      })
    );
  });

  it('forwards the cron bearer on the internal LINE review-request fetch', async () => {
    mockCreateServerClient.mockReturnValue(stubSupabase([dueRequest('line')]));

    const res = await POST(makeRequest({ Authorization: `Bearer ${CRON_KEY}` }));

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/notifications/line/review-request'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${CRON_KEY}` }),
      })
    );
  });
});
