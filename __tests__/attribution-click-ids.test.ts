import {
  sanitizeClickId,
  sanitizeUtm,
  sanitizeAttribution,
  parseGclAwCookie,
  parseGclAgCookie,
  parseGclGbCookie,
  resolveCapture,
  EMPTY_ATTRIBUTION,
} from '@/lib/attribution/click-ids';

const NOW = 1_784_978_748_000;

describe('sanitizeClickId', () => {
  it('accepts the URL-safe token shape Google issues', () => {
    expect(sanitizeClickId('Cj0KCQjw_abc-123.xyz')).toBe('Cj0KCQjw_abc-123.xyz');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeClickId('  abc123  ')).toBe('abc123');
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['injection attempt', "abc'; DROP TABLE bookings;--"],
    ['html', '<script>alert(1)</script>'],
    ['spaces inside', 'abc 123'],
    ['non-string', 12345],
    ['null', null],
    ['undefined', undefined],
    ['object', { gclid: 'abc' }],
  ])('rejects %s', (_label, value) => {
    expect(sanitizeClickId(value)).toBeNull();
  });

  it('rejects values over the 512-char cap', () => {
    expect(sanitizeClickId('a'.repeat(512))).toHaveLength(512);
    expect(sanitizeClickId('a'.repeat(513))).toBeNull();
  });
});

describe('sanitizeUtm', () => {
  it('allows the wider charset our tracking template produces', () => {
    expect(sanitizeUtm('google')).toBe('google');
    expect(sanitizeUtm('paid+search')).toBe('paid+search');
    expect(sanitizeUtm('21522043163')).toBe('21522043163');
  });

  it('rejects markup and over-long values', () => {
    expect(sanitizeUtm('<img src=x>')).toBeNull();
    expect(sanitizeUtm('a'.repeat(201))).toBeNull();
  });
});

describe('sanitizeAttribution', () => {
  it('normalizes a well-formed payload', () => {
    expect(
      sanitizeAttribution({
        gclid: 'abc123',
        gbraid: null,
        wbraid: undefined,
        utm_source: 'google',
        utm_medium: 'paid',
        utm_campaign: '21522043163',
      }),
    ).toEqual({
      gclid: 'abc123',
      gbraid: null,
      wbraid: null,
      utm_source: 'google',
      utm_medium: 'paid',
      utm_campaign: '21522043163',
    });
  });

  it('nulls out forged fields rather than rejecting the whole booking', () => {
    const result = sanitizeAttribution({ gclid: "'; DROP TABLE bookings;--", utm_source: 'google' });
    expect(result.gclid).toBeNull();
    expect(result.utm_source).toBe('google');
  });

  // The DB row must be uploadable as-is: Google rejects a conversion carrying
  // two click identifiers, so the boundary that owns the row enforces the rule.
  it('collapses a payload carrying all three identifiers, preferring gclid', () => {
    expect(sanitizeAttribution({ gclid: 'g', gbraid: 'gb', wbraid: 'wb' })).toMatchObject({
      gclid: 'g',
      gbraid: null,
      wbraid: null,
    });
  });

  it('falls through to gbraid, then wbraid, when the preferred ones are absent', () => {
    expect(sanitizeAttribution({ gbraid: 'gb', wbraid: 'wb' })).toMatchObject({
      gbraid: 'gb',
      wbraid: null,
    });
    expect(sanitizeAttribution({ wbraid: 'wb' })).toMatchObject({ wbraid: 'wb' });
  });

  it('falls through when the higher-precedence identifier is forged, not just absent', () => {
    expect(sanitizeAttribution({ gclid: '<script>', gbraid: 'gb' })).toMatchObject({
      gclid: null,
      gbraid: 'gb',
    });
  });

  it.each([[null], [undefined], ['not an object'], [42]])(
    'returns empty attribution for %p',
    (input) => {
      expect(sanitizeAttribution(input)).toEqual(EMPTY_ATTRIBUTION);
    },
  );
});

describe('parseGclAwCookie', () => {
  it('extracts the gclid and click time from the documented format', () => {
    expect(parseGclAwCookie('_ga=GA1.1.x; _gcl_aw=GCL.1784978748.TeSt_ClAuDe_123')).toEqual({
      gclid: 'TeSt_ClAuDe_123',
      clickedAt: 1_784_978_748_000,
    });
  });

  it('keeps dots inside the gclid itself', () => {
    expect(parseGclAwCookie('_gcl_aw=GCL.1784978748.abc.def')?.gclid).toBe('abc.def');
  });

  it('returns null when absent, malformed, or not a GCL record', () => {
    expect(parseGclAwCookie('_ga=GA1.1.x')).toBeNull();
    expect(parseGclAwCookie('_gcl_aw=GCL.1784978748')).toBeNull();
    expect(parseGclAwCookie('_gcl_aw=XYZ.1784978748.abc')).toBeNull();
  });

  // A cookie we can't date would have to be stamped "now", which is how an
  // expired click ID gets resurrected as fresh.
  it('rejects a record with an unparseable click time', () => {
    expect(parseGclAwCookie('_gcl_aw=GCL.notanumber.abc123')).toBeNull();
  });

  it('does not throw on a truncated percent-escape', () => {
    expect(() => parseGclAwCookie('_gcl_aw=GCL.1784978748.a%E0%A4')).not.toThrow();
    expect(parseGclAwCookie('_gcl_aw=GCL.1784978748.a%E0%A4')).toBeNull();
  });
});

describe('parseGclGbCookie', () => {
  // Counter-intuitive but verified in-browser 2026-07-25 with a cleared cookie
  // jar: `?wbraid=X` writes `_gcl_gb`, while `?gbraid=X` writes `_gcl_ag`.
  it('extracts the wbraid and click time', () => {
    expect(parseGclGbCookie('_gcl_gb=GCL.1784981831.CLEAN_WB_ONLY')).toEqual({
      wbraid: 'CLEAN_WB_ONLY',
      clickedAt: 1_784_981_831_000,
    });
  });

  it('does not confuse the gclid cookie for a wbraid', () => {
    expect(parseGclGbCookie('_gcl_aw=GCL.1784978748.abc')).toBeNull();
  });
});

describe('parseGclAgCookie', () => {
  // Shape verified by inspection on booking.len.golf, 2026-07-25.
  it('extracts the gbraid and click time', () => {
    expect(parseGclAgCookie('_gcl_ag=2.1.kTeStGbRaId456$i1784978779$bjEg4CLn')).toEqual({
      gbraid: 'TeStGbRaId456',
      clickedAt: 1_784_978_779_000,
    });
  });

  it('returns null rather than guessing if Google changes the shape', () => {
    expect(parseGclAgCookie('_gcl_ag=totally-different')).toBeNull();
    expect(parseGclAgCookie('_ga=GA1.1.x')).toBeNull();
    // ID still parseable but the timestamp field moved — undatable, so unusable.
    expect(parseGclAgCookie('_gcl_ag=2.1.kGB1$xNOPE$bx')).toBeNull();
  });
});

describe('resolveCapture', () => {
  it('captures click IDs straight from the landing URL', () => {
    const result = resolveCapture('?gclid=abc123&utm_source=google', '', null, NOW);
    expect(result).toMatchObject({ gclid: 'abc123', utm_source: 'google', capturedAt: NOW });
  });

  it('falls back to the _gcl_aw cookie — the len.golf cross-domain path', () => {
    const result = resolveCapture('', '_gcl_aw=GCL.1784978748.fromCookie', null, NOW);
    expect(result).toMatchObject({ gclid: 'fromCookie' });
  });

  it('dates the record from the cookie click time, not the visit', () => {
    const result = resolveCapture('', '_gcl_aw=GCL.1700000000.old', null, NOW);
    expect(result?.capturedAt).toBe(1_700_000_000_000);
  });

  it('does nothing when the cookie still holds the click we already stored', () => {
    const stored = { ...EMPTY_ATTRIBUTION, gclid: 'same', capturedAt: 1 };
    expect(resolveCapture('', '_gcl_aw=GCL.1784978748.same', stored, NOW)).toBeNull();
  });

  it('replaces the record when the cookie shows a newer click', () => {
    const stored = { ...EMPTY_ATTRIBUTION, gclid: 'old', capturedAt: 1 };
    expect(resolveCapture('', '_gcl_aw=GCL.1784978748.new', stored, NOW)?.gclid).toBe('new');
  });

  // Google permits exactly one of gclid/gbraid/wbraid per uploaded conversion,
  // so a new click must never leave a stale identifier of another kind behind.
  it('clears the other identifiers when a new click ID arrives', () => {
    const stored = { ...EMPTY_ATTRIBUTION, gclid: 'old-gclid', capturedAt: 1 };
    const result = resolveCapture('?gbraid=new-gbraid', '', stored, NOW);
    expect(result).toMatchObject({ gclid: null, gbraid: 'new-gbraid', wbraid: null });
  });

  it('prefers the URL over a stale cookie from an earlier click', () => {
    const stored = { ...EMPTY_ATTRIBUTION, gclid: 'cookie-gclid', capturedAt: 1 };
    const result = resolveCapture(
      '?gbraid=url-gbraid',
      '_gcl_aw=GCL.1784978748.cookie-gclid',
      stored,
      NOW,
    );
    expect(result).toMatchObject({ gclid: null, gbraid: 'url-gbraid' });
  });

  it('captures wbraid from the URL', () => {
    expect(resolveCapture('?wbraid=w123', '', null, NOW)).toMatchObject({ wbraid: 'w123' });
  });

  it('picks the newest click when both cookies are present', () => {
    const older = '_gcl_aw=GCL.1700000000.gclid1; _gcl_ag=2.1.kGB1$i1784978779$bx';
    expect(resolveCapture('', older, null, NOW)).toMatchObject({ gclid: null, gbraid: 'GB1' });

    const newer = '_gcl_aw=GCL.1784978779.gclid1; _gcl_ag=2.1.kGB1$i1700000000$bx';
    expect(resolveCapture('', newer, null, NOW)).toMatchObject({ gclid: 'gclid1', gbraid: null });
  });

  it('uses the _gcl_ag cookie when there is no gclid at all', () => {
    const result = resolveCapture('', '_gcl_ag=2.1.kGB1$i1784978779$bx', null, NOW);
    expect(result).toMatchObject({ gbraid: 'GB1' });
  });

  // This is the path that carries an iOS browser-to-web click from len.golf.
  it('recovers a wbraid from the _gcl_gb cookie with no URL param', () => {
    const result = resolveCapture('', '_gcl_gb=GCL.1784981831.WB1', null, NOW);
    expect(result).toMatchObject({ wbraid: 'WB1', capturedAt: 1_784_981_831_000 });
  });

  it('picks the newest across all three cookies', () => {
    const cookies = [
      '_gcl_aw=GCL.1700000000.G',
      '_gcl_ag=2.1.kGB$i1700000001$bx',
      '_gcl_gb=GCL.1784981831.WB',
    ].join('; ');
    expect(resolveCapture('', cookies, null, NOW)).toMatchObject({
      gclid: null,
      gbraid: null,
      wbraid: 'WB',
    });
  });

  // Regression: the stale-cookie-clobbers-newer-braid bug. This only shows up
  // across page loads — a single resolveCapture call can't reproduce it.
  it('does not let a stale gclid cookie destroy a newer wbraid on the next page load', () => {
    const sixtyDaysAgo = NOW - 60 * 24 * 60 * 60 * 1000;
    const staleCookie = `_gcl_aw=GCL.${Math.floor(sixtyDaysAgo / 1000)}.OLD_GCLID`;

    // Load 1: iOS browser-to-web ad click lands with ?wbraid, stale cookie present.
    const first = resolveCapture('?wbraid=W_NEW', staleCookie, null, NOW);
    expect(first).toMatchObject({ wbraid: 'W_NEW', gclid: null, capturedAt: NOW });

    // Load 2: refresh / navigation — no params, same 60-day-old cookie.
    const second = resolveCapture('', staleCookie, first, NOW + 1000);
    expect(second).toBeNull(); // nothing newer; the converting click survives
  });

  it('does not let a stale gclid cookie displace a newer gbraid record', () => {
    const stored = { ...EMPTY_ATTRIBUTION, gbraid: 'GB_NEW', capturedAt: NOW };
    const stale = `_gcl_aw=GCL.${Math.floor((NOW - 86_400_000) / 1000)}.OLD`;
    expect(resolveCapture('', stale, stored, NOW + 1000)).toBeNull();
  });

  it('still accepts a cookie click that is genuinely newer than the stored one', () => {
    const stored = { ...EMPTY_ATTRIBUTION, gbraid: 'GB_OLD', capturedAt: NOW - 86_400_000 };
    const fresher = `_gcl_aw=GCL.${Math.floor(NOW / 1000)}.FRESH`;
    expect(resolveCapture('', fresher, stored, NOW + 1000)).toMatchObject({
      gclid: 'FRESH',
      gbraid: null,
    });
  });

  it('does not re-age the record when the same click URL is loaded again', () => {
    const first = resolveCapture('?gclid=abc', '', null, NOW);
    const second = resolveCapture('?gclid=abc', '', first, NOW + 90_000_000);
    expect(second?.capturedAt).toBe(NOW);
  });

  // Google permits exactly one identifier per uploaded conversion, so a URL
  // carrying several must not produce an unusable row.
  it('collapses multiple click IDs in one URL to a single identifier', () => {
    const result = resolveCapture('?gclid=g&gbraid=gb&wbraid=wb', '', null, NOW);
    expect(result).toMatchObject({ gclid: 'g', gbraid: null, wbraid: null });
  });

  it('records UTMs arriving without a click ID, keeping the original click age', () => {
    const stored = { ...EMPTY_ATTRIBUTION, gclid: 'abc', capturedAt: 5000 };
    const result = resolveCapture('?utm_source=newsletter', '', stored, NOW);
    expect(result).toMatchObject({ gclid: 'abc', utm_source: 'newsletter', capturedAt: 5000 });
  });

  // A different click carries different campaign context; inheriting the
  // previous click's UTMs would misreport which campaign drove the booking.
  it('does not carry the previous click UTMs onto a newly detected click', () => {
    const stored = { ...EMPTY_ATTRIBUTION, utm_source: 'oldcampaign', capturedAt: 5000 };
    const result = resolveCapture('', '_gcl_aw=GCL.1784978748.abc', stored, NOW);
    expect(result).toMatchObject({ gclid: 'abc', utm_source: null });
  });

  it('does nothing on an ordinary visit with no params and no cookies', () => {
    expect(resolveCapture('', '', null, NOW)).toBeNull();
  });

  it('drops a forged click ID instead of storing it', () => {
    expect(resolveCapture('?gclid=<script>alert(1)</script>', '', null, NOW)).toBeNull();
  });
});
