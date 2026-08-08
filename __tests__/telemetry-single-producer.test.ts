/**
 * Every dataLayer event a GTM trigger listens for must have exactly ONE
 * producing file.
 *
 * The sibling suite `booking-confirmed-single-producer.test.ts` makes this
 * argument in full for `booking_confirmed`, where a double-count also doubles a
 * 1200 THB Google Ads conversion value. This file generalises the cheap half of
 * it to the rest of the funnel: GTM tags are `oncePerEvent`, meaning once per
 * dataLayer PUSH, so a second producer anywhere is a straight double-count.
 *
 * The failure mode this guards is specifically NOT loud. A push with no
 * listening trigger is completely invisible — `ConfirmationContent.tsx` carried
 * a stray `booking_confirmed` push for months for exactly that reason. The
 * danger is that the silence ends all at once: the day someone adds the
 * matching trigger, every latent producer goes live together and the numbers
 * jump for a reason nobody can find. `bay_booking_date_selected` is in that
 * state right now — its trigger is staged and unpublished — which is precisely
 * when the guard needs to exist.
 *
 * `booking_confirmed` is deliberately absent: it has its own suite with
 * stricter assertions, and duplicating it here would mean two places to update.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { globSync } from 'glob';

const ROOT = join(__dirname, '..');

const SOURCE_GLOBS = ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'utils/**/*.{ts,tsx}'];

const files = SOURCE_GLOBS.flatMap((pattern) =>
  globSync(pattern, {
    cwd: ROOT,
    absolute: true,
    ignore: ['**/node_modules/**', '**/.next/**', '**/.claude/**'],
  }),
);

/**
 * Strip comments before scanning — this file's own subject matter appears
 * throughout the prose in `lib/booking-telemetry.ts`, which documents the
 * locale bug that produced these events. Explaining an event is not emitting
 * one.
 */
const codeOf = (file: string): string =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const relative = (file: string): string => file.slice(ROOT.length + 1).replace(/\\/g, '/');

/**
 * event name -> the single file allowed to push it.
 *
 * Note the owner is NOT always `lib/booking-telemetry.ts`. The step-viewed
 * events are pushed through the shared `useStepViewedTelemetry` hook, which
 * takes the event NAME as an argument — so the string literal lives with the
 * flow that owns the funnel, and that is the file this test pins.
 */
const OWNERS: ReadonlyArray<readonly [event: string, owner: string]> = [
  ['bay_booking_date_selected', 'lib/booking-telemetry.ts'],
  ['auth_provider_chosen', 'lib/booking-telemetry.ts'],
  ['bay_booking_step_viewed', 'app/[locale]/(features)/bookings/hooks/useBookingFlow.ts'],
  ['course_rental_step_viewed', 'app/[locale]/course-rental/page.tsx'],
  ['course_rental_confirmed', 'app/[locale]/course-rental/page.tsx'],
  ['course_rental_payment_redirect', 'app/[locale]/course-rental/page.tsx'],
];

describe('GTM-consumed dataLayer events have a single producer', () => {
  test('the source tree contains files to scan', () => {
    // Guards the test itself: a broken glob would make every case below pass
    // vacuously.
    expect(files.length).toBeGreaterThan(100);
  });

  test.each(OWNERS)('%s is emitted only by its owner', (event, owner) => {
    const emitters = files
      .filter((file) => new RegExp(`['"\`]${event}['"\`]`).test(codeOf(file)))
      .map(relative)
      .sort();

    expect(emitters).toEqual([owner]);
  });
});
