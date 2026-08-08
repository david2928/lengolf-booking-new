/**
 * `booking_confirmed` must have exactly ONE producer.
 *
 * GTM trigger #123 listens for the dataLayer event `booking_confirmed` and fans
 * out to three tags: GA4 (#74), the Google Ads conversion (#62, 1200 THB per
 * fire) and the Meta Pixel CompleteRegistration (#15). Every tag is
 * `oncePerEvent`, which means once per dataLayer PUSH — not once per page and
 * not once per booking. A second producer is therefore a straight double-count,
 * and on the Ads side it silently doubles the per-booking value that tag #62's
 * notes were specifically rewritten (1813 -> 1200) to stop overstating.
 *
 * This is not hypothetical. `ConfirmationContent.tsx` pushed this exact event on
 * mount until 2026-08-08. It was invisible because the only trigger at the time
 * matched Click Text, so nothing consumed the push — the bug was latent, and
 * would have gone live the moment trigger #123 was published. A unit test on the
 * telemetry helper could not have caught it; only counting producers can.
 *
 * If this test fails, do not add an allowance. Route the new call site through
 * `pushBookingConfirmed()` instead.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { globSync } from 'glob';

const ROOT = join(__dirname, '..');

/**
 * Source we own. Excludes build output, deps, worktree copies and this suite.
 *
 * `hooks/` and `middleware.ts` were missing until 2026-08-08 — a probe file
 * dropped in `hooks/` slipped past this scan entirely. The vacuity guard below
 * cannot catch that: the other globs match hundreds of files, so `files.length`
 * stays healthy while the scan silently covers less than it claims.
 */
const SOURCE_GLOBS = [
  'app/**/*.{ts,tsx}',
  'components/**/*.{ts,tsx}',
  'hooks/**/*.{ts,tsx}',
  'lib/**/*.{ts,tsx}',
  'utils/**/*.{ts,tsx}',
  'middleware.ts',
];

const files = SOURCE_GLOBS.flatMap((pattern) =>
  globSync(pattern, {
    cwd: ROOT,
    absolute: true,
    ignore: ['**/node_modules/**', '**/.next/**', '**/.claude/**'],
  }),
);

/**
 * Strip block and line comments before scanning.
 *
 * Prose is not a producer. Without this the test fails on its own explanatory
 * comments — including the one in ConfirmationContent.tsx that exists precisely
 * to stop someone reinstating the push this test guards against, which would be
 * a uniquely annoying way to be wrong.
 */
const codeOf = (file: string): string =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('booking_confirmed has a single producer', () => {
  test('the source tree contains files to scan', () => {
    // Guards the test itself: a broken glob would make every assertion below
    // pass vacuously.
    expect(files.length).toBeGreaterThan(100);
  });

  test('only lib/booking-telemetry.ts emits the event name', () => {
    const emitters = files.filter((file) => {
      // The event name as it reaches the dataLayer. Matches both a literal
      // push and the pushEventToGtm(...) call form.
      return /['"`]booking_confirmed['"`]/.test(codeOf(file));
    });

    const relative = emitters.map((f) => f.slice(ROOT.length + 1).replace(/\\/g, '/')).sort();

    expect(relative).toEqual(['lib/booking-telemetry.ts']);
  });

  test('no component pushes a booking_confirmed event object directly', () => {
    // Belt and braces: catches a push assembled without the bare string
    // literal, e.g. via a constant, landing in a React component.
    const offenders = files
      .filter((f) => /[\\/](components|app)[\\/]/.test(f))
      .filter((file) => {
        return /dataLayer\s*\.\s*push\s*\(/.test(codeOf(file));
      })
      .map((f) => f.slice(ROOT.length + 1).replace(/\\/g, '/'));

    // app/[locale]/layout.tsx holds the GTM snippet itself, which legitimately
    // initialises and pushes to the dataLayer.
    expect(offenders).toEqual(['app/[locale]/layout.tsx']);
  });
});
