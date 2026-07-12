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
 * because of an infra hiccup.
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
   * minute). Real lockdown of this route is auth (separately tracked).
   */
  lineNotify: { max: 30, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitConfig>;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Client IP for rate-limit keying. On Vercel `x-forwarded-for` is set by the
 * platform (client-supplied values are stripped), so the first entry is
 * trustworthy. 'unknown' only occurs in local dev.
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return first;
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
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
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== 'boolean') {
      throw new Error('rate_limit_hit returned an unexpected shape');
    }
    return {
      allowed: row.allowed,
      retryAfterSeconds:
        typeof row.retry_after_seconds === 'number' ? row.retry_after_seconds : windowSeconds,
    };
  } catch (err) {
    console.error(`[RateLimit] check failed for ${key} (fail-open):`, err);
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
