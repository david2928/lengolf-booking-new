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
 *
 * SCOPE: `app/` only. The walk-up resolves a file to its layout chain, which is
 * meaningless from a `components/` path — a shared component's container
 * coverage depends on which routes render it, which is not statically knowable
 * here. Two of the helpers below (`pushAuthProviderChosen`,
 * `pushProfileDataToGtm`) currently live exclusively in `components/`, so this
 * suite says nothing about them. A green run is NOT "every dataLayer push in
 * the repo is covered"; it is "every producer that sits on a route is".
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

/** Public id of the container every surface must load. */
const GTM_ID = 'GTM-MKCHVJKW';

/** The one module allowed to define the container. */
const CONTAINER_MODULE = 'components/shared/GoogleTagManager.tsx';

/**
 * How a layout declares that it mounts the container.
 *
 * Both halves are required. The tag name alone is not evidence: an auto-import
 * can resolve `GoogleTagManager` to `next/third-parties/google`, which exports
 * that same name and needs a `gtmId` prop — so the element would render, the
 * regex would match, and no container would load. Checking the import path
 * pins it to OUR module.
 */
const mountsContainer = (source: string): boolean =>
  /<GoogleTagManager\b/.test(source) &&
  /from\s+['"]@\/components\/shared\/GoogleTagManager['"]/.test(source);

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
    if (existsSync(layout) && mountsContainer(codeOf(layout))) {
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

  test('LIFF is covered by its own layout, not by inheritance', () => {
    // `/liff/*` must carry its own mount. If this ever resolves to some ancestor
    // instead, the container has been hoisted and the next test explains why
    // that is a problem.
    expect(containerLayoutFor(join(APP, 'liff', 'booking', 'page.tsx'))).toBe('app/liff/layout.tsx');
  });

  test('the ROOT layout does not mount the container', () => {
    // Asserted directly rather than inferred from the walk-up, which returns the
    // NEAREST mounting ancestor and stops — so adding a root mount while leaving
    // the per-surface ones in place is invisible to every other test here.
    //
    // It matters because the root layout also wraps `/auth/error`, which renders
    // outside `[locale]` precisely to stay dependency-free while reporting an
    // auth failure. Mounting at the root is the "simplification" that quietly
    // puts ad tags on the error page.
    expect(mountsContainer(codeOf(join(APP, 'layout.tsx')))).toBe(false);
  });

  test('the container is defined in exactly one place, with the right id', () => {
    // Two inline copies can drift — a different linker config or a different
    // container id on one surface is a silently divergent measurement surface.
    const definitions = globSync('{app,components}/**/*.{ts,tsx}', {
      cwd: ROOT,
      absolute: true,
      ignore: ['**/node_modules/**', '**/.next/**', '**/.claude/**'],
    })
      .filter((file) => /googletagmanager\.com\/gtm\.js/.test(codeOf(file)))
      .map((f) => toPosix(f.slice(ROOT.length + 1)));

    expect(definitions).toEqual([CONTAINER_MODULE]);

    // The id itself, not just the presence of a loader. A typo or a pasted id
    // from another property would load a container nobody owns — measurement
    // lost with no error anywhere, which is the whole class of bug this file
    // exists to catch.
    expect(codeOf(join(ROOT, CONTAINER_MODULE))).toContain(GTM_ID);
  });
});
