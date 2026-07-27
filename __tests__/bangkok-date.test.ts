/**
 * Guards the two Bangkok date primitives in `utils/date.ts`.
 *
 * Both exist because the naive idioms are wrong in ways a Bangkok dev machine
 * can never reproduce — server and browser agree locally, so typecheck, lint
 * and build all stay green while production is broken (that is exactly how the
 * next-intl `timeZone` bug survived three months; see `i18n-timezone.test.ts`).
 *
 *   getBangkokDateString  replaces  new Date().toISOString().split('T')[0]
 *   parseBangkokDate      replaces  new Date(`${iso}T00:00:00`)
 *
 * Every assertion is zone-independent: it either compares absolute instants
 * (`toISOString`, `getTime`) or passes an explicit `timeZone` to `Intl`. They
 * therefore hold on a UTC CI runner and on a Bangkok laptop alike.
 */
import { getBangkokDateString, parseBangkokDate } from '@/utils/date';

describe('getBangkokDateString', () => {
  it('returns the Bangkok day for the pre-07:00 window UTC truncation gets wrong', () => {
    // 02:00 Bangkok on Jul 30 is still Jul 29 in UTC. On Vercel (UTC runtime)
    // this window is ~7 hours long, every single night.
    const instant = new Date('2026-07-30T02:00:00+07:00');

    expect(getBangkokDateString(instant)).toBe('2026-07-30');

    // The bug, pinned: this is what the replaced idiom returned.
    expect(instant.toISOString().split('T')[0]).toBe('2026-07-29');
  });

  it('does not shift forward at the end of the Bangkok day', () => {
    // The mirror-image mistake — a helper that over-corrects would land on the
    // 31st here.
    const instant = new Date('2026-07-30T23:59:00+07:00');

    expect(getBangkokDateString(instant)).toBe('2026-07-30');
  });

  it('defaults to now', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-30T01:30:00+07:00'));

    try {
      expect(getBangkokDateString()).toBe('2026-07-30');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('parseBangkokDate', () => {
  it('anchors a bare yyyy-MM-dd at Bangkok midnight, not the runtime zone', () => {
    // Bangkok is a fixed UTC+7 with no DST, so midnight is always 17:00Z the
    // day before — no offset table needed.
    expect(parseBangkokDate('2026-07-30').toISOString()).toBe('2026-07-29T17:00:00.000Z');
  });

  it('anchors a wall-clock HH:mm at Bangkok', () => {
    expect(parseBangkokDate('2026-07-30', '14:00').toISOString()).toBe(
      '2026-07-30T07:00:00.000Z',
    );
  });

  it('accepts HH:mm:ss', () => {
    expect(parseBangkokDate('2026-07-30', '14:00:30').toISOString()).toBe(
      '2026-07-30T07:00:30.000Z',
    );
  });

  it('ignores a time component on the date argument', () => {
    // Callers hand us DB values that are occasionally full timestamps rather
    // than the `date` column's yyyy-MM-dd.
    expect(parseBangkokDate('2026-07-30T00:00:00').getTime()).toBe(
      parseBangkokDate('2026-07-30').getTime(),
    );
  });

  it('leaves an input that already carries an offset or Z alone', () => {
    // Such a string is already an absolute instant; re-anchoring it at Bangkok
    // midnight would move it.
    expect(parseBangkokDate('2026-07-30T00:00:00Z').toISOString()).toBe(
      '2026-07-30T00:00:00.000Z',
    );
    expect(parseBangkokDate('2026-07-30T00:00:00+09:00').toISOString()).toBe(
      '2026-07-29T15:00:00.000Z',
    );
  });

  it('recognises the shorter offset spellings ISO 8601 allows', () => {
    // A hour-only offset or a lowercase designator is still an absolute
    // instant. Missing that, the string would fall through to the date-only
    // path and silently lose both its time and its offset.
    expect(parseBangkokDate('2026-07-30T10:00+09').toISOString()).toBe(
      '2026-07-30T01:00:00.000Z',
    );
    expect(parseBangkokDate('2026-07-30T10:00+0900').toISOString()).toBe(
      '2026-07-30T01:00:00.000Z',
    );
    expect(parseBangkokDate('2026-07-30T00:00:00z').toISOString()).toBe(
      '2026-07-30T00:00:00.000Z',
    );
  });

  it('does not mistake the day in a bare yyyy-MM-dd for an offset', () => {
    // The trap in widening the offset pattern: `-30` at the end of
    // `2026-07-30` looks exactly like a two-digit negative offset. Reading it
    // as one sends the value down the pass-through path, which resolves to UTC
    // midnight — reintroducing the very day-shift this helper exists to stop.
    expect(parseBangkokDate('2026-07-30').toISOString()).toBe('2026-07-29T17:00:00.000Z');
    expect(parseBangkokDate('2026-12-31').toISOString()).toBe('2026-12-30T17:00:00.000Z');
  });

  it('treats a missing time as midnight rather than failing', () => {
    // The old call sites produced an Invalid Date here and threw inside the
    // formatter. Midnight is the friendlier failure, but it is a *plausible*
    // wrong answer rather than a loud one — pinned so the trade stays deliberate.
    expect(parseBangkokDate('2026-07-30', '').toISOString()).toBe('2026-07-29T17:00:00.000Z');
  });

  it('renders as the picked day in Bangkok', () => {
    const label = new Intl.DateTimeFormat('en', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Bangkok',
    }).format(parseBangkokDate('2026-07-30'));

    expect(label).toBe('Thu, Jul 30, 2026');
  });

  it('fixes the day-early render for browsers east of +07', () => {
    // `new Date('2026-07-30T00:00:00')` parses in the *runtime's* zone. Pinning
    // next-intl's display zone to Asia/Bangkok made that correct for Bangkok
    // browsers only — a Tokyo browser produces the instant below, which is
    // still Jul 29 once formatted back in Bangkok.
    const asParsedInTokyo = new Date('2026-07-30T00:00:00+09:00');

    const render = (d: Date) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);

    expect(render(asParsedInTokyo)).toBe('2026-07-29');
    expect(render(parseBangkokDate('2026-07-30'))).toBe('2026-07-30');
  });

  it('fixes the hours-early session time for browsers east of +07', () => {
    // Same defect on the time axis: a 10:00 Bangkok booking read on a Tokyo
    // phone rendered as 08:00.
    const asParsedInTokyo = new Date('2026-07-30T10:00+09:00');

    const render = (d: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);

    expect(render(asParsedInTokyo)).toBe('08:00');
    expect(render(parseBangkokDate('2026-07-30', '10:00'))).toBe('10:00');
  });
});
