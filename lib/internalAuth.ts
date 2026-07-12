import 'server-only';
import { timingSafeEqual } from 'crypto';

/**
 * Shared-secret auth for internal self-fetch API routes (staff LINE
 * notifications). Reuses CRON_API_KEY — already set across all Vercel
 * environments for the review-request pg_cron job — so locking these
 * routes down needs no new env var.
 *
 * Runtime check only: no module-load assertion, so a missing env var
 * fails the request (401) instead of the build.
 */

/** Headers internal callers attach when self-fetching a protected route. */
export function internalAuthHeaders(): Record<string, string> {
  const apiKey = process.env.CRON_API_KEY;
  if (!apiKey) {
    // The receiving route will 401; warn here too so the calling route's
    // logs point at the root cause instead of a bare rejected fetch.
    console.error('[internalAuth] CRON_API_KEY is not set; internal notify call will be rejected');
    return {};
  }
  return { Authorization: `Bearer ${apiKey}` };
}

/**
 * Verifies the shared secret on a protected route. Fails closed: if
 * CRON_API_KEY is unset on the server, every request is rejected —
 * matching the posture of /api/notifications/process-review-requests.
 */
export function isInternalRequestAuthorized(request: Request): boolean {
  const apiKey = process.env.CRON_API_KEY;
  if (!apiKey) {
    console.error('[internalAuth] CRON_API_KEY is not set; rejecting internal API call');
    return false;
  }
  const provided = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${apiKey}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
