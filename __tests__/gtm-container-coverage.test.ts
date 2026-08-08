/**
 * A dataLayer push on a surface that loads no container is not measurement.
 *
 * This is the defect the LIFF flow shipped with: `pushBookingConfirmed()` was
 * called from `/liff/booking` from PR #136, correctly and with tests, into a
 * `window.dataLayer` array that nothing read — because the GTM snippet was
 * inlined in `app/[locale]/layout.tsx` and `/liff/*` renders outside it. It
 * fails silently by construction: the push succeeds, the array grows, and the
 * only symptom is a number that never appears in GA4. Over the 30 days to
 * 2026-08-08 that hid 115 of 206 API-created bookings.
 *
 * So the invariant is structural, not behavioural, and it is checked at the
 * source level for the same reason `mobile-nav-scroll.test.ts` is: jsdom
 * performs no layout and mounts no third-party script, so a render test passes
 * just as happily against the broken arrangement.
 *
 * The producer list is DISCOVERED rather than hardcoded — a new telemetry call
 * site on a new surface has to satisfy this without anyone remembering to add
 * it here.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname, relative, sep } from 'path';
import { globSync } from 'glob';

const ROOT = join(__dirname, '..');
const APP = join(ROOT, 'app');

/**
 * Every helper that reaches `window.dataLayer`, plus the raw call. Anything
 * naming one of these is a telemetry producer and needs a container above it.
 */
const PRODUCER_PATTERN =
  /\b(pushEventToGtm|pushBookingConfirmed|pushAuthProviderChosen|pushStepViewed|useStepViewedTelemetry|pushProfileDataToGtm)\b|dataLayer\s*\.\s*push\s*\(/;

/** How a layout declares that it mounts the container. */
const MOUNTS_CONTAINER = /<GoogleTagManager\b/;

/**
 * Comments are not producers, and this file is surrounded by them. Both
 * `ConfirmationContent.tsx` and `app/liff/layout.tsx` discuss the dataLayer at
 * length without touching it; counting prose would make the test fail on the
 * documentation that exists to prevent the bug.
 */
const codeOf = (file: string): string =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const toPosix = (p: string): string => p.split(sep).join('/');

const sourceFiles = globSync('**/*.{ts,tsx}', {
  cwd: APP,
  absolute: true,
  ignore: ['**/node_modules/**', '**/.next/**', '**/.claude/**'],
});

/**
 * Walk from a file up to `app/`, returning the first layout that mounts the
 * container. Mirrors how Next.js nests layouts: a page is wrapped by every
 * `layout.tsx` on its path, so any one of them loading GTM is sufficient.
 *
 * Returns null when no ancestor mounts it — which is the failure this suite
 * exists to report.
 */
function containerLayoutFor(file: string): string | null {
  let dir = dirname(file);

  while (dir.startsWith(APP)) {
    const layout = join(dir, 'layout.tsx');
    if (existsSync(layout) && MOUNTS_CONTAINER.test(codeOf(layout))) {
      return toPosix(relative(ROOT, layout));
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

describe('every dataLayer producer sits under a GTM container', () => {
  const producers = sourceFiles.filter((file) => PRODUCER_PATTERN.test(codeOf(file)));

  test('the scan finds the known producers', () => {
    // Guards the test itself. A broken glob or a renamed helper would make the
    // assertion below pass against an empty list, which is the failure mode
    // this whole file is about.
    const relative = producers.map((f) => toPosix(f.slice(ROOT.length + 1))).sort();

    expect(relative).toEqual(
      expect.arrayContaining([
        'app/liff/booking/page.tsx',
        'app/[locale]/(features)/bookings/components/booking/steps/details/useBookingDetailsForm.ts',
      ]),
    );
  });

  test.each(
    // `test.each` over a discovered list needs at least one row to be
    // meaningful; the guard above proves the list is populated.
    producers.map((file) => [toPosix(file.slice(ROOT.length + 1)), file] as const),
  )('%s is covered by a layout that mounts the container', (_name, file) => {
    expect(containerLayoutFor(file)).not.toBeNull();
  });

  test('LIFF is covered by its own layout, not by accident', () => {
    // Specific enough to fail if someone "simplifies" by hoisting the container
    // into the ROOT layout: that would also pull it into /auth/error, which
    // renders outside [locale] precisely to stay dependency-free.
    expect(containerLayoutFor(join(APP, 'liff', 'booking', 'page.tsx'))).toBe('app/liff/layout.tsx');
  });

  test('the container is defined in exactly one place', () => {
    // Two inline copies can drift — a different linker config or a different
    // container id on one surface is a silently divergent measurement surface.
    const definitions = globSync('{app,components}/**/*.{ts,tsx}', {
      cwd: ROOT,
      absolute: true,
      ignore: ['**/node_modules/**', '**/.next/**', '**/.claude/**'],
    })
      .filter((file) => /googletagmanager\.com\/gtm\.js/.test(codeOf(file)))
      .map((f) => toPosix(f.slice(ROOT.length + 1)));

    expect(definitions).toEqual(['components/shared/GoogleTagManager.tsx']);
  });
});
