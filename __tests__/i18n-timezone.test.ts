/**
 * Guards the timezone rules that the booking calendars depend on.
 *
 * The bug this locks down (live on prod 2026-04-18 → 2026-07-27): picking
 * Jul 30 in the bay calendar displayed "Wed, Jul 29, 2026".
 *
 * `i18n/request.ts` did not set `timeZone`, so next-intl fell back to the
 * *server runtime's* zone — UTC on Vercel — and serialised that zone into the
 * RSC payload, meaning the browser formatted in UTC too. A calendar pick is a
 * Bangkok-local midnight Date, and midnight +07 is 17:00 the PREVIOUS day in
 * UTC, so every `format.dateTime` call rendered one day early.
 *
 * It was invisible in dev because the dev machine already runs in
 * Asia/Bangkok, so the payload carried the right zone. Build, typecheck and
 * lint all passed while prod was broken — hence a test rather than a comment.
 *
 * Every assertion below passes an explicit `timeZone` to `Intl`, so these hold
 * regardless of the zone the test runner itself is in (CI runs UTC).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

/** The Bangkok calendar date of an instant, as yyyy-mm-dd. */
const bangkokDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);

describe('next-intl timezone configuration', () => {
  it('declares an explicit Asia/Bangkok timeZone', () => {
    // Without this, next-intl inherits the server runtime's zone (UTC on
    // Vercel) and ships it to the client. LENGOLF is a single-venue Bangkok
    // business, so the display zone is fixed rather than per-user.
    expect(read('i18n/request.ts')).toMatch(/timeZone:\s*['"]Asia\/Bangkok['"]/);
  });
});

describe('a calendar-picked date must not shift when displayed', () => {
  // The exact instant react-day-picker hands back for a "July 30" click made
  // in a Bangkok browser: local midnight.
  const picked = new Date('2026-07-30T00:00:00+07:00');

  it('renders as Jul 30 in Asia/Bangkok', () => {
    const label = new Intl.DateTimeFormat('en', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Bangkok',
    }).format(picked);

    expect(label).toBe('Thu, Jul 30, 2026');
  });

  it('renders as Jul 29 in UTC — the regression, pinned so it stays fixed', () => {
    const label = new Intl.DateTimeFormat('en', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(picked);

    // This is what production showed. If the config regresses to an unset or
    // UTC timeZone, this is the string customers see.
    expect(label).toBe('Wed, Jul 29, 2026');
  });
});

describe('deriving a yyyy-mm-dd date string', () => {
  it('toISOString() truncation loses a day for Bangkok-local dates', () => {
    const bangkokMidnight = new Date('2026-07-30T00:00:00+07:00');

    // Why `toISOString().split('T')[0]` is never safe here: it converts to UTC
    // first. For any Bangkok wall-clock time between 00:00 and 07:00 it yields
    // the previous calendar day.
    expect(bangkokMidnight.toISOString().split('T')[0]).toBe('2026-07-29');
    expect(bangkokDate(bangkokMidnight)).toBe('2026-07-30');
  });

  it("course-rental's minDate is not derived via toISOString", () => {
    // Regression guard: this made the calendar's earliest selectable day
    // *yesterday* between 00:00 and 07:00 Bangkok, letting customers book a
    // pickup in the past.
    const source = read('app/[locale]/course-rental/page.tsx');
    const todayStrBlock = source.slice(
      source.indexOf('const todayStr'),
      source.indexOf('const todayStr') + 500,
    );

    expect(todayStrBlock).not.toContain('toISOString');
    expect(todayStrBlock).toContain('getFullYear');
  });
});
