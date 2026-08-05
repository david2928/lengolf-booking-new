/**
 * Contract guards for GET /api/cron/meta-capi-upload.
 *
 * These are SOURCE-LEVEL assertions by necessity. The route needs a live
 * Supabase client and a real Graph API endpoint, and jsdom does no network — so
 * a render-style test would have to stub both, and would then pass just as
 * happily against a route that sent before staging, threw on a missing token,
 * or skipped the auth check entirely. What is being pinned here is the SHAPE of
 * the handler, and that is exactly what the file text can prove.
 *
 * Same reasoning (and same limits) as `__tests__/mobile-nav-scroll.test.ts`:
 * these cannot show the upload works. They show that the properties we paid for
 * are still present.
 */
import fs from 'fs';
import path from 'path';

const ROUTE = path.join(__dirname, '..', 'app/api/cron/meta-capi-upload/route.ts');
const source = fs.readFileSync(ROUTE, 'utf8');

describe('meta-capi-upload route contract', () => {
  // The repo has failed production builds twice on module-load env assertions
  // (MARKETING_PREFS_SECRET, SHOPEEPAY_*). This must never regress.
  it('does not throw on missing configuration', () => {
    expect(source).toMatch(/getMetaCapiConfig\(\)/);
    expect(source).toMatch(/skipped: 'not configured'/);
    expect(source).not.toMatch(/throw new Error\([^)]*META_CAPI/);
  });

  it('requires a bearer token with a constant-time compare', () => {
    expect(source).toMatch(/CRON_API_KEY/);
    expect(source).toMatch(/charCodeAt\(i\) \^ expected\.charCodeAt\(i\)/);
  });

  /**
   * A missing CRON_API_KEY is a deployment fault, not a caller fault. Collapsing
   * it into 401 would make a silently-unconfigured environment look like a bad
   * token in the pg_cron logs, and the two have completely different fixes.
   */
  it('separates misconfiguration (503) from a bad token (401)', () => {
    expect(source).toMatch(/status: 503/);
    expect(source).toMatch(/status: 401/);
  });

  /**
   * Nothing may happen before the token is checked — not the config read, not
   * the candidate query. An unauthenticated caller must not be able to make
   * this route touch the database at all.
   */
  it('checks the token before doing any work', () => {
    const authIdx = source.indexOf('const auth = verifyCronSecret');
    const queryIdx = source.indexOf("from('meta_capi_pending')");
    expect(authIdx).toBeGreaterThan(-1);
    expect(queryIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(queryIdx);
  });

  /**
   * Every exclusion rule — non-cancelled, non-test, inside the 7-day window,
   * not already uploaded/skipped/exhausted — lives in the view. A route that
   * read `bookings` directly would bypass all four at once, which is both an
   * overbilling risk (cancelled bookings sent as Purchases) and a batch-poison
   * risk (a stale event_time rejects the WHOLE request).
   */
  it('reads candidates from the view, never from bookings directly', () => {
    expect(source).toMatch(/from\('meta_capi_pending'\)/);
    expect(source).not.toMatch(/from\('bookings'\)/);
  });

  it('stages tracking rows before sending', () => {
    const stageIdx = source.indexOf("status: 'pending'");
    const sendIdx = source.indexOf('sendEvents(');
    expect(stageIdx).toBeGreaterThan(-1);
    expect(sendIdx).toBeGreaterThan(-1);
    expect(stageIdx).toBeLessThan(sendIdx);
  });

  it('aborts the run when staging fails', () => {
    expect(source).toMatch(/staging failed/i);
  });

  /**
   * `?dryRun=1` is the operator's safe probe. If it reached a write it would
   * stamp real bookings 'skipped' — and the view anti-joins 'skipped', so those
   * conversions would be excluded permanently, by a command whose whole promise
   * was that it changed nothing.
   */
  it('returns from a dry run before any write', () => {
    const dryRunIdx = source.indexOf('dryRun: true');
    const writeIdx = source.indexOf('.upsert(');
    expect(dryRunIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(-1);
    expect(dryRunIdx).toBeLessThan(writeIdx);
  });

  it('enforces the 7-day window in the app as well as the view', () => {
    expect(source).toMatch(/MAX_EVENT_AGE_MS/);
    expect(source).toMatch(/7 \* 24 \* 60 \* 60 \* 1000/);
  });

  it('validates action_source at the fetch boundary', () => {
    expect(source).toMatch(/physical_store/);
    expect(source).toMatch(/Unexpected action_source/);
  });

  /**
   * Retry bookkeeping is the RPC's job. A read-then-write from the app races
   * two overlapping ticks — both read the same count, both write back the same
   * +1 — so a permanently-broken row (bad token, revoked dataset) never reaches
   * the exhaustion threshold and retries every night forever.
   */
  it('increments retries through the atomic RPC, never in the route', () => {
    expect(source).toMatch(/rpc\('increment_meta_capi_retry'/);
    // Absent from every write payload the route builds: PostgREST updates only
    // the columns it is given, which is what preserves the accumulated count.
    expect(source).not.toMatch(/retry_count:/);
  });

  /**
   * A permanent failure (#190 invalid token, #100 missing permission) and a
   * transient one both land in `error_message`. Without the code, the row that
   * needs a human looks identical to the one that will fix itself tonight.
   */
  it('records Meta’s error code alongside the message', () => {
    expect(source).toMatch(/errorCode/);
  });

  // CLAUDE.md: side effects are awaited or wrapped in after(), never floating.
  it('has no floating promises', () => {
    expect(source).not.toMatch(/^\s*void\s+\w+\(/m);
    expect(source).not.toMatch(/\)\s*\.then\(/);
  });

  it('never logs identifier values', () => {
    expect(source).not.toMatch(
      /console\.(log|warn|error)\([^)]*\b(booking_email|customer_email|phone_number)\b/,
    );
  });

  /**
   * `marketing.meta_capi_uploads` must stay free of PII, hashed or otherwise —
   * only identifier KINDS ('em','ph',...) are ever recorded. `user_data` is the
   * object holding the hashes; the route has no business naming it at all, so
   * its absence is the cheapest possible proof the hashes are never persisted
   * or logged.
   */
  it('never touches the hashed user_data', () => {
    expect(source).not.toMatch(/user_data/);
  });
});
