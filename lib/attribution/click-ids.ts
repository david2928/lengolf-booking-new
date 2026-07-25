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

/** UTM values come from our own tracking template but are user-editable in the URL. */
const UTM_PATTERN = /^[A-Za-z0-9_.\-+|% ]+$/;
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
 * Normalize an untrusted request body fragment into storable attribution.
 * Used by both write paths (`/api/bookings/create`, `/api/clubs/order`).
 */
export function sanitizeAttribution(input: unknown): Attribution {
  if (!input || typeof input !== 'object') return { ...EMPTY_ATTRIBUTION };
  const raw = input as Record<string, unknown>;
  return {
    gclid: sanitizeClickId(raw.gclid),
    gbraid: sanitizeClickId(raw.gbraid),
    wbraid: sanitizeClickId(raw.wbraid),
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
 * `_gcl_aw=GCL.<unix-seconds>.<gclid>` — the documented Google tag format.
 * The gclid itself may contain dots, so everything past the second one is value.
 */
export function parseGclAwCookie(
  cookieString: string,
): { gclid: string; clickedAt: number | null } | null {
  const raw = readCookie(cookieString, '_gcl_aw');
  if (!raw) return null;
  const parts = decodeURIComponent(raw).split('.');
  if (parts.length < 3 || parts[0] !== 'GCL') return null;
  const gclid = sanitizeClickId(parts.slice(2).join('.'));
  if (!gclid) return null;
  const seconds = Number(parts[1]);
  return {
    gclid,
    clickedAt: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null,
  };
}

/**
 * `_gcl_ag=2.1.k<gbraid>$i<unix-seconds>$b<opaque>` — undocumented, verified by
 * inspection on 2026-07-25. Best-effort: if Google changes the shape this
 * returns null and we simply fall back to the URL param.
 */
export function parseGclAgCookie(
  cookieString: string,
): { gbraid: string; clickedAt: number | null } | null {
  const raw = readCookie(cookieString, '_gcl_ag');
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const gbraid = sanitizeClickId(/(?:^|\.)k([^$]+)\$/.exec(decoded)?.[1]);
    if (!gbraid) return null;
    const seconds = Number(/\$i(\d+)/.exec(decoded)?.[1]);
    return {
      gbraid,
      clickedAt: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null,
    };
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
    gclid: sanitizeClickId(params.get('gclid')),
    gbraid: sanitizeClickId(params.get('gbraid')),
    wbraid: sanitizeClickId(params.get('wbraid')),
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
    return { ...fromUrl, capturedAt: now };
  }

  // No click ID in the URL — fall back to the cookies Google's own tag wrote,
  // which is the path that carries a len.golf click across to booking.len.golf.
  const aw = parseGclAwCookie(cookieString);
  const ag = parseGclAgCookie(cookieString);

  if (aw && aw.gclid !== stored?.gclid) {
    return {
      ...EMPTY_ATTRIBUTION,
      ...pickUtms(fromUrl, stored),
      gclid: aw.gclid,
      capturedAt: aw.clickedAt ?? now,
    };
  }

  if (!aw && ag && ag.gbraid !== stored?.gbraid) {
    return {
      ...EMPTY_ATTRIBUTION,
      ...pickUtms(fromUrl, stored),
      gbraid: ag.gbraid,
      capturedAt: ag.clickedAt ?? now,
    };
  }

  // UTMs can arrive without a click ID (organic, or our tracking template on a
  // non-auto-tagged link). Worth recording, but it isn't a new click, so the
  // existing capturedAt stands.
  if (stored && (fromUrl.utm_source || fromUrl.utm_medium || fromUrl.utm_campaign)) {
    return { ...stored, ...pickUtms(fromUrl, stored) };
  }
  if (!stored && (fromUrl.utm_source || fromUrl.utm_medium || fromUrl.utm_campaign)) {
    return { ...fromUrl, capturedAt: now };
  }

  return null; // nothing new — leave the stored record (and its age) alone
}

function pickUtms(
  fromUrl: Attribution,
  stored: StoredAttribution | null,
): Pick<Attribution, 'utm_source' | 'utm_medium' | 'utm_campaign'> {
  const hasUrlUtms = !!(fromUrl.utm_source || fromUrl.utm_medium || fromUrl.utm_campaign);
  const source = hasUrlUtms ? fromUrl : stored;
  return {
    utm_source: source?.utm_source ?? null,
    utm_medium: source?.utm_medium ?? null,
    utm_campaign: source?.utm_campaign ?? null,
  };
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
