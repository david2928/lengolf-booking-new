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

// Lets us invoke the real request config as a plain function. `getRequestConfig`
// is an identity wrapper on the server build, but Jest's jsdom environment
// resolves next-intl's react-client build, where it throws "not supported".
jest.mock('next-intl/server', () => ({
  getRequestConfig: (fn: unknown) => fn,
}));

const REPO_ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

// Source with whole-line comments dropped. The guards below search for the
// broken idioms by name, and the fixes are commented with the very names being
// searched for — without this, a correct file fails on its own prose. Only
// full-line comments go, so a `//` inside a URL or string can't eat real code.
const readCode = (rel: string) =>
  read(rel)
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
    .join('\n');

/** The Bangkok calendar date of an instant, as yyyy-mm-dd. */
const bangkokDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);

describe('next-intl timezone configuration', () => {
  it('resolves an explicit Asia/Bangkok timeZone', async () => {
    // Asserted against the module's actual return value, not its source text:
    // a grep would still pass if the line were commented out or stranded in a
    // branch that never runs.
    //
    // Without this, next-intl inherits the server runtime's zone (UTC on
    // Vercel) and ships it to the client. LENGOLF is a single-venue Bangkok
    // business, so the display zone is fixed rather than per-user.
    const requestConfig = (await import('@/i18n/request')).default as unknown as (
      params: { requestLocale: Promise<string | undefined> },
    ) => Promise<{ locale: string; timeZone?: string }>;

    const config = await requestConfig({ requestLocale: Promise.resolve('en') });

    expect(config.timeZone).toBe('Asia/Bangkok');
    expect(config.locale).toBe('en');
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

  it('the LIFF coaching preview does not derive today via toISOString', () => {
    // Regression guard for the double conversion in `filterAvailabilitySlots`:
    // `new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }))`
    // builds a Date whose *local* fields are Bangkok wall time, and
    // `toISOString()` then subtracts the browser's offset a second time. Its
    // direction depends on the viewer's zone — accidentally right on UTC,
    // wrong for the Thai customers this page is for — so the render suite in
    // `liff-availability-preview-timezone.test.tsx` cannot catch a regression
    // on a UTC CI runner. This can.
    const source = readCode('components/liff/coaching/AvailabilityPreview.tsx');

    expect(source).not.toContain('toISOString');
    expect(source).toContain('getBangkokDateString');
  });

  it("course-rental's minDate is not derived via toISOString", () => {
    // Regression guard: this made the calendar's earliest selectable day
    // *yesterday* between 00:00 and 07:00 Bangkok, letting customers book a
    // pickup in the past.
    const source = read('app/[locale]/course-rental/page.tsx');
    const start = source.indexOf('const todayStr');

    // Fail loudly on a rename rather than silently scanning an empty window.
    expect(start).toBeGreaterThan(-1);

    const todayStrBlock = source.slice(start, start + 500);

    expect(todayStrBlock).not.toContain('toISOString');
    expect(todayStrBlock).toContain('getFullYear');
  });
});

describe('Bangkok wall-clock values are parsed with an explicit offset', () => {
  /**
   * These are display-only paths. Pinning next-intl's `timeZone` fixed them for
   * Bangkok browsers, but `new Date('2026-07-30T00:00:00')` and
   * ``new Date(`${date}T${time}`)`` still parse in the *viewer's* runtime zone —
   * a day / several hours early for anyone east of +07 (Singapore, Seoul,
   * Tokyo, Sydney). Only the `+07:00` form is unconditionally correct;
   * `parseBangkokDate` in `utils/date.ts` is that form, and its behaviour is
   * covered directly in `bangkok-date.test.ts`.
   *
   * The defect is a function of the *viewer's* zone, which a single Jest
   * process cannot vary, so these are source guards rather than render
   * assertions — a render test would pass against the broken code on the UTC
   * CI runner.
   */
  const anchored = (block: string) => /parseBangkokDate|\+07:00/.test(block);

  /** Source of `file` from `marker` onwards, failing loudly if it is renamed. */
  const blockAt = (file: string, marker: string, length = 500) => {
    const source = readCode(file);
    const start = source.indexOf(marker);

    expect(start).toBeGreaterThan(-1);

    return source.slice(start, start + length);
  };

  it.each([
    ['components/vip/DashboardView.tsx', 'const formatBookingDateTime'],
    ['components/vip/PackagesList.tsx', 'const formatDate'],
    // Already correct before this pass — pinned so it stays the reference.
    ['components/vip/BookingsList.tsx', 'const formatDate'],
    ['components/vip/BookingsList.tsx', 'const formatTime'],
  ])('%s: %s anchors at +07:00', (file, marker) => {
    const block = blockAt(file, marker);

    expect(anchored(block)).toBe(true);
    // The two idioms this replaces, either of which silently reintroduces it.
    expect(block).not.toMatch(/T00:00:00['"`]/);
    expect(block).not.toMatch(/T\$\{[^}]+\}['"`]/);
  });

  it('both package-expiry renders on the VIP page are anchored', () => {
    // The expression appears twice — the cached path and the fetched path.
    // They drifted apart once already; a count keeps a half-fix from passing.
    const source = readCode('app/[locale]/(features)/vip/page.tsx');

    expect(source.match(/parseBangkokDate\(firstActivePackage\.expiryDate\)/g)).toHaveLength(2);
    expect(source).not.toContain("expiryDate + 'T00:00:00'");
  });
});
