/**
 * Google Ads click-ID capture (gclid / gbraid / wbraid) + UTM attribution.
 *
 * Why this exists: the offline-conversion uploader in lengolf-ads-etl sends
 * only hashed email + phone. Identifier-only uploads attribute nothing unless
 * Google can match them to a stored ad click, so the conversions never landed.
 * Persisting a click ID on the booking gives the uploader something to match.
 *
 * The awkward part is that ~97% of paid clicks land on len.golf, not on
 * booking.len.golf — so by the time the user reaches the booking flow the query
 * string is long gone. What saves us is that Google's tag writes its `_gcl_*`
 * cookies on the registrable domain (`.len.golf`), which means a gclid captured
 * on the marketing site is readable here. Hence the cookie fallbacks below;
 * reading `location.search` alone would capture almost nothing.
 *
 * This module is import-safe on the server (the API routes use the sanitizers),
 * so nothing touches `window` at module scope.
 */

export const ATTRIBUTION_STORAGE_KEY = 'lengolf.attribution';

/**
 * Google drops a gclid after 90 days — a conversion uploaded against an older
 * click is never attributed. Holding one past that point is actively harmful:
 * the uploader would send the dead click ID *instead of* the hashed identifiers
 * (gclid takes precedence over user_identifiers), so a stale ID converts a
 * weak-but-working upload into a guaranteed miss.
 */
export const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Click IDs are opaque URL-safe tokens; anything else is a forged payload. */
const CLICK_ID_PATTERN = /^[A-Za-z0-9_.-]+$/;
const MAX_CLICK_ID_LENGTH = 512;

/**
 * UTM values come from our own tracking template but are user-editable in the
 * URL. `%` is deliberately excluded: values arrive already decoded from
 * URLSearchParams, so a literal `%` has no legitimate source here and would be
 * a double-decoding hazard for anything downstream that re-encodes them.
 */
const UTM_PATTERN = /^[A-Za-z0-9_.\-+| ]+$/;
const MAX_UTM_LENGTH = 200;

export interface Attribution {
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

interface StoredAttribution extends Attribution {
  /**
   * When the *click* happened, not when we last saw the visitor. Taken from the
   * `_gcl_*` cookie's embedded timestamp where available, else capture time.
   * Never refreshed on subsequent page loads — otherwise a 100-day-old click
   * would look fresh forever and we'd upload an expired ID.
   */
  capturedAt: number;
}

export const EMPTY_ATTRIBUTION: Attribution = {
  gclid: null,
  gbraid: null,
  wbraid: null,
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
};

// ---------------------------------------------------------------------------
// Sanitizers — shared with the API routes. Never trust a client-supplied value
// that ends up in an outbound Google Ads API call.
// ---------------------------------------------------------------------------

export function sanitizeClickId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_CLICK_ID_LENGTH) return null;
  return CLICK_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function sanitizeUtm(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_UTM_LENGTH) return null;
  return UTM_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Google permits exactly one of gclid/gbraid/wbraid per uploaded conversion, so
 * a row carrying two of them is unusable. Enforce the precedence here — at the
 * boundary that owns the DB row — rather than leaving it to the uploader in a
 * separate repo. gclid first: it is the only identifier that can accompany
 * hashed user identifiers, and it takes precedence over them at Google's end.
 */
function collapseClickIds(
  gclid: string | null,
  gbraid: string | null,
  wbraid: string | null,
): Pick<Attribution, 'gclid' | 'gbraid' | 'wbraid'> {
  if (gclid) return { gclid, gbraid: null, wbraid: null };
  if (gbraid) return { gclid: null, gbraid, wbraid: null };
  return { gclid: null, gbraid: null, wbraid: wbraid ?? null };
}

/**
 * Normalize an untrusted request body fragment into storable attribution.
 * Used by both write paths (`/api/bookings/create`, `/api/clubs/order`).
 */
export function sanitizeAttribution(input: unknown): Attribution {
  if (!input || typeof input !== 'object') return { ...EMPTY_ATTRIBUTION };
  const raw = input as Record<string, unknown>;
  return {
    ...collapseClickIds(
      sanitizeClickId(raw.gclid),
      sanitizeClickId(raw.gbraid),
      sanitizeClickId(raw.wbraid),
    ),
    utm_source: sanitizeUtm(raw.utm_source),
    utm_medium: sanitizeUtm(raw.utm_medium),
    utm_campaign: sanitizeUtm(raw.utm_campaign),
  };
}

export function hasClickId(a: Attribution): boolean {
  return !!(a.gclid || a.gbraid || a.wbraid);
}

// ---------------------------------------------------------------------------
// Cookie parsing — pure functions so they're testable without a DOM.
// ---------------------------------------------------------------------------

function readCookie(cookieString: string, name: string): string | null {
  for (const part of cookieString.split('; ')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return null;
}

/**
 * Both parsers require a parseable click time, not just an ID. The whole point
 * of reading these cookies is to date the record from the *click*; a cookie we
 * can't date would have to be stamped with "now", which is precisely how an
 * expired click ID gets resurrected as fresh and displaces the working
 * hashed-identifier upload.
 */
function parseSeconds(value: string | undefined): number | null {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/**
 * `GCL.<unix-seconds>.<click-id>` — the Google tag's standard cookie format,
 * used by `_gcl_aw` (gclid) and `_gcl_gb` (wbraid). The ID itself may contain
 * dots, so everything past the second one is value.
 */
function parseGclCookie(
  cookieString: string,
  name: string,
): { value: string; clickedAt: number } | null {
  const raw = readCookie(cookieString, name);
  if (!raw) return null;
  try {
    // decodeURIComponent throws URIError on a truncated escape sequence.
    const parts = decodeURIComponent(raw).split('.');
    if (parts.length < 3 || parts[0] !== 'GCL') return null;
    const value = sanitizeClickId(parts.slice(2).join('.'));
    const clickedAt = parseSeconds(parts[1]);
    if (!value || clickedAt === null) return null;
    return { value, clickedAt };
  } catch {
    return null;
  }
}

/** `_gcl_aw` — gclid. Documented format. */
export function parseGclAwCookie(
  cookieString: string,
): { gclid: string; clickedAt: number } | null {
  const parsed = parseGclCookie(cookieString, '_gcl_aw');
  return parsed && { gclid: parsed.value, clickedAt: parsed.clickedAt };
}

/**
 * `_gcl_gb` — wbraid, in the same `GCL.<ts>.<value>` shape as `_gcl_aw`.
 * Verified in-browser on 2026-07-25: landing with `?wbraid=X` (and no other
 * `_gcl_*` cookies present) writes `_gcl_gb=GCL.<ts>.X`. The name is
 * counter-intuitive — `gbraid` goes to `_gcl_ag`, not to `_gcl_gb`.
 *
 * This is what lets an iOS browser-to-web click survive the
 * len.golf → booking.len.golf hop, where the query string does not.
 */
export function parseGclGbCookie(
  cookieString: string,
): { wbraid: string; clickedAt: number } | null {
  const parsed = parseGclCookie(cookieString, '_gcl_gb');
  return parsed && { wbraid: parsed.value, clickedAt: parsed.clickedAt };
}

/**
 * `_gcl_ag=2.1.k<gbraid>$i<unix-seconds>$b<opaque>` — undocumented, verified by
 * inspection on 2026-07-25. Best-effort: if Google changes the shape this
 * returns null and we simply fall back to the URL param.
 */
export function parseGclAgCookie(
  cookieString: string,
): { gbraid: string; clickedAt: number } | null {
  const raw = readCookie(cookieString, '_gcl_ag');
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const gbraid = sanitizeClickId(/(?:^|\.)k([^$]+)\$/.exec(decoded)?.[1]);
    const clickedAt = parseSeconds(/\$i(\d+)/.exec(decoded)?.[1]);
    if (!gbraid || clickedAt === null) return null;
    return { gbraid, clickedAt };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Capture / read — browser only.
// ---------------------------------------------------------------------------

function parseUrl(search: string): Attribution {
  const params = new URLSearchParams(search);
  return {
    ...collapseClickIds(
      sanitizeClickId(params.get('gclid')),
      sanitizeClickId(params.get('gbraid')),
      sanitizeClickId(params.get('wbraid')),
    ),
    utm_source: sanitizeUtm(params.get('utm_source')),
    utm_medium: sanitizeUtm(params.get('utm_medium')),
    utm_campaign: sanitizeUtm(params.get('utm_campaign')),
  };
}

function load(): StoredAttribution | null {
  try {
    const raw = localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAttribution;
    if (!parsed || typeof parsed.capturedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function save(value: StoredAttribution): void {
  try {
    localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* private mode / quota — attribution is never worth failing a booking over */
  }
}

/**
 * Decide what to persist given the current URL, cookies and stored state.
 * Exported for testing; `captureAttribution` is the browser entry point.
 *
 * Last-touch wins. A click ID arriving in the URL replaces the stored record
 * wholesale — including clearing the *other* two identifiers — because Google
 * permits exactly one of gclid/gbraid/wbraid per uploaded conversion, and
 * pairing a gclid from one click with a gbraid from another would misattribute.
 */
export function resolveCapture(
  urlSearch: string,
  cookieString: string,
  stored: StoredAttribution | null,
  now: number,
): StoredAttribution | null {
  const fromUrl = parseUrl(urlSearch);

  if (hasClickId(fromUrl)) {
    // Re-landing on the same URL (refresh, back button, a shared link) is not a
    // new click, so the record keeps its original age.
    const sameClick =
      stored !== null &&
      stored.gclid === fromUrl.gclid &&
      stored.gbraid === fromUrl.gbraid &&
      stored.wbraid === fromUrl.wbraid;
    return { ...fromUrl, capturedAt: sameClick ? stored.capturedAt : now };
  }

  // No click ID in the URL — fall back to the cookies Google's own tag wrote,
  // which is the path that carries a len.golf click across to booking.len.golf.
  //
  // These are compared by CLICK TIME, not by "does this differ from what we
  // stored". `_gcl_aw` lives 90 days, so a visitor who searched once and later
  // clicked an iOS ad still carries the old cookie; an identity comparison
  // would see `stored.gclid === null` on a braid record, treat the stale cookie
  // as new, and overwrite the braid that actually converted — destroying
  // exactly the identifiers this feature exists to capture.
  const candidates: { ids: Partial<Attribution>; clickedAt: number }[] = [];

  const aw = parseGclAwCookie(cookieString);
  if (aw && aw.gclid !== stored?.gclid) {
    candidates.push({ ids: { gclid: aw.gclid }, clickedAt: aw.clickedAt });
  }

  const ag = parseGclAgCookie(cookieString);
  if (ag && ag.gbraid !== stored?.gbraid) {
    candidates.push({ ids: { gbraid: ag.gbraid }, clickedAt: ag.clickedAt });
  }

  const gb = parseGclGbCookie(cookieString);
  if (gb && gb.wbraid !== stored?.wbraid) {
    candidates.push({ ids: { wbraid: gb.wbraid }, clickedAt: gb.clickedAt });
  }

  const newest = candidates.sort((a, b) => b.clickedAt - a.clickedAt)[0];
  if (newest && (!stored || newest.clickedAt >= stored.capturedAt)) {
    return {
      ...EMPTY_ATTRIBUTION,
      // A different click carries different campaign context, so the previous
      // click's UTMs must not ride along. They are usually absent here anyway —
      // UTMs don't cross the len.golf → booking.len.golf boundary.
      utm_source: fromUrl.utm_source,
      utm_medium: fromUrl.utm_medium,
      utm_campaign: fromUrl.utm_campaign,
      ...newest.ids,
      capturedAt: newest.clickedAt,
    };
  }

  // UTMs can arrive without a click ID (organic, or our tracking template on a
  // non-auto-tagged link). Worth recording, but it isn't a new click, so the
  // existing capturedAt stands.
  const hasUrlUtms = !!(fromUrl.utm_source || fromUrl.utm_medium || fromUrl.utm_campaign);
  if (hasUrlUtms) {
    return stored
      ? {
          ...stored,
          utm_source: fromUrl.utm_source,
          utm_medium: fromUrl.utm_medium,
          utm_campaign: fromUrl.utm_campaign,
        }
      : { ...fromUrl, capturedAt: now };
  }

  return null; // nothing new — leave the stored record (and its age) alone
}

/** Capture from the current page. Safe to call on every load; no-ops on the server. */
export function captureAttribution(): void {
  if (typeof window === 'undefined') return;
  try {
    const next = resolveCapture(
      window.location.search,
      document.cookie,
      load(),
      Date.now(),
    );
    if (next) save(next);
  } catch {
    /* never let attribution break a page */
  }
}

/** Read the stored attribution, discarding anything past Google's 90-day window. */
export function readAttribution(): Attribution {
  if (typeof window === 'undefined') return { ...EMPTY_ATTRIBUTION };
  const stored = load();
  if (!stored) return { ...EMPTY_ATTRIBUTION };

  if (Date.now() - stored.capturedAt > ATTRIBUTION_TTL_MS) {
    try {
      localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return { ...EMPTY_ATTRIBUTION };
  }

  return {
    gclid: stored.gclid ?? null,
    gbraid: stored.gbraid ?? null,
    wbraid: stored.wbraid ?? null,
    utm_source: stored.utm_source ?? null,
    utm_medium: stored.utm_medium ?? null,
    utm_campaign: stored.utm_campaign ?? null,
  };
}
