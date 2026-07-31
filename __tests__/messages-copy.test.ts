/**
 * Copy rules that hold across every message catalog.
 *
 * House rule: no em dashes in user-facing copy.
 *
 * `booking-step-header.test.tsx` pins that rule for the booking header's own
 * keys. But a copy rule belongs to the copy, not to whichever component happens
 * to render it — and the slip that prompted this file was
 * `auth.login.guestNudgeBody`, a key no header test would ever have looked at.
 * So this walks all five catalogs end to end instead of naming keys.
 *
 * Scope is `messages/` — the next-intl catalogs. The hand-rolled LIFF strings in
 * `lib/liff/*translations.ts` are a separate system and are NOT covered here;
 * they fold in when phase 2 migrates LIFF onto `messages/`. (`lib/liff/
 * bay-rates-data.ts` currently carries em dashes for that reason.)
 */
import enMessages from '@/messages/en.json';
import thMessages from '@/messages/th.json';
import koMessages from '@/messages/ko.json';
import jaMessages from '@/messages/ja.json';
import zhMessages from '@/messages/zh.json';

const CATALOGS = {
  en: enMessages,
  th: thMessages,
  ko: koMessages,
  ja: jaMessages,
  zh: zhMessages,
} as const;

type Locale = keyof typeof CATALOGS;
const LOCALES = Object.keys(CATALOGS) as Locale[];

const EM_DASH = '—';

/** Every string leaf in a catalog, addressed by its dotted key path. */
function stringLeaves(node: unknown, path: string[] = []): Array<{ key: string; value: string }> {
  if (typeof node === 'string') return [{ key: path.join('.'), value: node }];
  if (node === null || typeof node !== 'object') return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([segment, child]) =>
    stringLeaves(child, [...path, segment]),
  );
}

describe('message catalogs use no em dash', () => {
  // Offenders are reported as key paths rather than as a bare pass/fail: a
  // failure should name the string to fix without a catalog-wide hunt for it.
  test.each(LOCALES)('%s', (locale) => {
    const offenders = stringLeaves(CATALOGS[locale])
      .filter(({ value }) => value.includes(EM_DASH))
      .map(({ key, value }) => `${key}: ${value}`);

    expect(offenders).toEqual([]);
  });
});

/**
 * A catalog-wide "found nothing" assertion is exactly the kind that can pass for
 * the wrong reason, so pin the walker itself. If `stringLeaves` ever stopped
 * recursing — a shape change, a bad narrowing — every locale above would go
 * green while checking almost nothing.
 */
describe('stringLeaves reaches the whole catalog', () => {
  test.each(LOCALES)('%s', (locale) => {
    const leaves = stringLeaves(CATALOGS[locale]);

    // ~1,130 per locale today. The floor is deliberately far below that: it is
    // here to catch a walker that collapsed, not to track catalog size.
    expect(leaves.length).toBeGreaterThan(500);

    // A key that is nested two levels deep, so a walker that only read the top
    // level cannot satisfy it.
    expect(leaves.map(({ key }) => key)).toContain('auth.login.guestNudgeBody');
  });
});

/**
 * A retired key stays retired.
 *
 * `consentNoteWithOptIn` was a second variant of the booking consent
 * disclosure, appending "Marketing emails are separate and use the opt-in
 * above." That clause was meta-commentary about an adjacent checkbox rather
 * than a statement about the booking, so it was dropped and the key removed
 * from all five catalogs.
 *
 * `types/messages.d.ts` types every locale off `en.json`, so a locale MISSING a
 * key is a typecheck error. A locale KEEPING an extra one is not. Without this,
 * a stale Thai or Japanese variant could sit in the catalog indefinitely and be
 * "restored" by the next translator who noticed English had lost it.
 */
describe('retired keys stay retired', () => {
  test.each(LOCALES)('%s has no consentNoteWithOptIn', (locale) => {
    const keys = stringLeaves(CATALOGS[locale]).map(({ key }) => key);

    expect(keys).not.toContain('bookings.detailsStep.consentNoteWithOptIn');
  });

  /**
   * Retired when booking creation moved its notifications under `after()`.
   * The route dispatches them after the response, so it can no longer report
   * whether they landed — there is no `notificationsSuccess` to branch on and
   * nothing left to raise this toast. Delivery failures go to
   * `booking_process_logs` instead.
   */
  test.each(LOCALES)('%s has no notificationsFailed', (locale) => {
    const keys = stringLeaves(CATALOGS[locale]).map(({ key }) => key);

    expect(keys).not.toContain('errors.notificationsFailed');
  });
});
