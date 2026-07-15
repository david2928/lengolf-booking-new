/**
 * Per-IP rate limiting for unauthenticated write routes.
 *
 * Backed by the Supabase RPC `rate_limit_hit` (fixed-window counter on
 * public.rate_limit_counters) because Vercel serverless keeps no usable
 * in-memory state across instances — an in-process Map only throttles a
 * single warm lambda and resets on every cold start.
 *
 * FAIL-OPEN by design: any RPC/network error logs and allows the request.
 * The limiter exists to stop scripted abuse (e.g. minting one CRM customers
 * row per request via guest checkout); it must never block a paying customer
 * because of an infra hiccup. Consequence: a missing migration or a missing
 * service_role EXECUTE grant silently disables the limiter — watch for the
 * `[RateLimit]` warnings/errors in the logs after deploy.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export interface RateLimitConfig {
  /** Max requests allowed per window. */
  max: number;
  /** Fixed-window length in seconds (epoch-aligned server-side). */
  windowSeconds: number;
}

export const RATE_LIMITS = {
  /**
   * Guest-checkout writes (/api/clubs/order + /api/clubs/reserve — shared
   * bucket so an attacker can't double the budget by alternating routes).
   * A legit customer submits 1–2 orders; 10/hour also leaves headroom for
   * several guests behind one hotel NAT.
   */
  clubsWrite: { max: 10, windowSeconds: 3600 },
  /**
   * /api/notifications/line — called via self-fetch from ~10 internal server
   * routes, all arriving from a small pool of shared Vercel egress IPs, so
   * this must stay well above legit peak (a busy evening is a few pings per
   * minute). Real lockdown of this route is auth (separately tracked): the
   * egress pool is shared platform-wide, so per-IP limiting can neither fully
   * stop an attacker on Vercel nor be tightened without risking legit pings.
   */
  lineNotify: { max: 30, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitConfig>;

/** Shared guest-checkout bucket key — used by BOTH clubs/order and clubs/reserve. */
export function clubsWriteKey(request: NextRequest): string {
  return `clubs-write:${getClientIp(request)}`;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Normalize a candidate client IP for rate-limit keying, or reject it.
 *  - IPv4 → as-is; IPv4-mapped IPv6 → the embedded IPv4.
 *  - IPv6 → its /64 prefix: a single residential/mobile allocation is a /64
 *    and privacy extensions rotate the host half per connection, so keying
 *    the full address would let an attacker rotate for free (and mint one
 *    counters row per request).
 *  - Anything not IP-shaped → null. Vercel sets x-forwarded-for itself, but
 *    this helper must stay safe behind other proxies where the first entry
 *    is attacker-controlled text.
 */
function normalizeIp(raw: string | null | undefined): string | null {
  const candidate = raw?.trim();
  if (!candidate || candidate.length > 45) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(candidate)) return candidate;
  if (!/^[0-9a-fA-F:.]+$/.test(candidate) || !candidate.includes(':')) return null;

  // IPv4-mapped IPv6 (::ffff:203.0.113.9) → key on the IPv4.
  const v4 = candidate.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) return v4[1];

  // Expand `::` so the first 4 hextets (= the /64) are unambiguous.
  const parts = candidate.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts[1] ? parts[1].split(':') : [];
  const hasGap = parts.length === 2;
  if (hasGap ? head.length + tail.length > 7 : head.length !== 8) return null;
  const groups = hasGap
    ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail]
    : head;
  if (groups.some((g) => g.length > 4)) return null;
  return `${groups.slice(0, 4).map((g) => g || '0').join(':').toLowerCase()}::/64`;
}

/**
 * Client IP for rate-limit keying. On Vercel `x-forwarded-for` is set by the
 * platform (client-supplied values are stripped), so the first entry is
 * trustworthy. Non-IP-shaped values are rejected rather than used as keys;
 * 'unknown' only occurs in local dev (or behind a misconfigured proxy).
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return (
    normalizeIp(forwarded?.split(',')[0]) ??
    normalizeIp(request.headers.get('x-real-ip')) ??
    'unknown'
  );
}

/**
 * Count a hit for `key` and report whether the request is allowed.
 * `admin` must be the service-role client — the RPC has no anon grant.
 */
export async function checkRateLimit(
  admin: any,
  key: string,
  { max, windowSeconds }: RateLimitConfig,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await admin.rpc('rate_limit_hit', {
      p_key: key.slice(0, 128),
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== 'boolean') {
      throw new Error('rate_limit_hit returned an unexpected shape');
    }
    if (!row.allowed) {
      // Distinct tag so suppressed traffic (esp. staff LINE pings swallowed by
      // their non-blocking callers) stays visible in the Vercel logs.
      console.warn(`[RateLimit] denied ${key}`);
    }
    return {
      allowed: row.allowed,
      retryAfterSeconds:
        typeof row.retry_after_seconds === 'number' ? row.retry_after_seconds : windowSeconds,
    };
  } catch (err: any) {
    // 42883 / PGRST202 = rate_limit_hit missing (migration not applied yet).
    // Expected during rollout — warn, don't alarm. Anything else is real.
    if (err?.code === '42883' || err?.code === 'PGRST202') {
      console.warn(`[RateLimit] rate_limit_hit RPC missing — migration not applied yet (fail-open) for ${key}`);
    } else {
      console.error(`[RateLimit] check failed for ${key} (fail-open):`, err);
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/** Standard 429 for a denied request. */
export function rateLimitedResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, result.retryAfterSeconds)) },
    },
  );
}
