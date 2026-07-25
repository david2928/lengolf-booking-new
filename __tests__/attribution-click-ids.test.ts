import {
  sanitizeClickId,
  sanitizeUtm,
  sanitizeAttribution,
  parseGclAwCookie,
  parseGclAgCookie,
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

  it('survives a missing timestamp by reporting no click time', () => {
    expect(parseGclAwCookie('_gcl_aw=GCL.notanumber.abc123')).toEqual({
      gclid: 'abc123',
      clickedAt: null,
    });
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

  it('captures wbraid, which has no cookie equivalent', () => {
    expect(resolveCapture('?wbraid=w123', '', null, NOW)).toMatchObject({ wbraid: 'w123' });
  });

  it('ignores the _gcl_ag cookie while a gclid cookie is present', () => {
    const cookies = '_gcl_aw=GCL.1784978748.gclid1; _gcl_ag=2.1.kGB1$i1784978779$bx';
    expect(resolveCapture('', cookies, null, NOW)).toMatchObject({ gclid: 'gclid1', gbraid: null });
  });

  it('uses the _gcl_ag cookie when there is no gclid at all', () => {
    const result = resolveCapture('', '_gcl_ag=2.1.kGB1$i1784978779$bx', null, NOW);
    expect(result).toMatchObject({ gbraid: 'GB1' });
  });

  it('records UTMs arriving without a click ID, keeping the original click age', () => {
    const stored = { ...EMPTY_ATTRIBUTION, gclid: 'abc', capturedAt: 5000 };
    const result = resolveCapture('?utm_source=newsletter', '', stored, NOW);
    expect(result).toMatchObject({ gclid: 'abc', utm_source: 'newsletter', capturedAt: 5000 });
  });

  it('carries stored UTMs forward when a cookie click arrives without them', () => {
    const stored = { ...EMPTY_ATTRIBUTION, utm_source: 'google', capturedAt: 5000 };
    const result = resolveCapture('', '_gcl_aw=GCL.1784978748.abc', stored, NOW);
    expect(result).toMatchObject({ gclid: 'abc', utm_source: 'google' });
  });

  it('does nothing on an ordinary visit with no params and no cookies', () => {
    expect(resolveCapture('', '', null, NOW)).toBeNull();
  });

  it('drops a forged click ID instead of storing it', () => {
    expect(resolveCapture('?gclid=<script>alert(1)</script>', '', null, NOW)).toBeNull();
  });
});
