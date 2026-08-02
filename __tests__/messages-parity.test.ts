/**
 * Every catalog must define exactly the same key paths as `en`.
 *
 * Nothing else enforces this. `types/messages.d.ts` is
 * `typeof import('../messages/en.json')`, so it types the ENGLISH catalog and
 * nothing more — a key missing from `th`, `ko`, `ja` or `zh` is not a type
 * error, not a lint error, and not a build error. It is a runtime
 * `MISSING_MESSAGE` that only appears for customers reading that language,
 * which is the audience least likely to report it back in English.
 *
 * That failure mode has already cost this project once: 200 MISSING_MESSAGE
 * warnings during SSG were dismissed as "a known next-intl v3 quirk" and the
 * white-screen bug behind them shipped to Vercel twice.
 *
 * Extra keys are reported too, not just missing ones. A key that survives in
 * `th` after being deleted from `en` is dead copy that will be translated,
 * reviewed and maintained forever without ever rendering.
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

/** Locales checked against `en`, which is the source of truth. */
const TRANSLATIONS = (Object.keys(CATALOGS) as Locale[]).filter((l) => l !== 'en');

/**
 * Every string leaf's dotted key path. Same walker as `messages-copy.test.ts`;
 * deliberately duplicated rather than shared, so neither test can be quietly
 * disarmed by a change made for the other.
 */
function keyPaths(node: unknown, path: string[] = []): string[] {
  if (typeof node === 'string') return [path.join('.')];
  if (node === null || typeof node !== 'object') return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([segment, child]) =>
    keyPaths(child, [...path, segment])
  );
}

const EN_KEYS = keyPaths(CATALOGS.en);

describe('message catalogs are in step with en', () => {
  test.each(TRANSLATIONS)('%s defines every en key', (locale) => {
    const theirs = new Set(keyPaths(CATALOGS[locale]));
    // Reported as key paths, not a count: a failure should name what to add
    // rather than send someone diffing two 1,000-line files.
    const missing = EN_KEYS.filter((k) => !theirs.has(k));
    expect(missing).toEqual([]);
  });

  test.each(TRANSLATIONS)('%s defines no keys en has dropped', (locale) => {
    const mine = new Set(EN_KEYS);
    const extra = keyPaths(CATALOGS[locale]).filter((k) => !mine.has(k));
    expect(extra).toEqual([]);
  });
});

/**
 * A "found no differences" assertion can pass for the wrong reason, so pin the
 * walker. If `keyPaths` ever stopped recursing, every test above would go
 * green while checking almost nothing.
 */
describe('keyPaths', () => {
  it('walks nested objects to their string leaves', () => {
    expect(keyPaths({ a: { b: { c: 'x' }, d: 'y' }, e: 'z' })).toEqual(['a.b.c', 'a.d', 'e']);
  });

  it('finds a realistic number of keys in the real catalog', () => {
    // Guards against the walker silently returning [] or only top-level keys.
    expect(EN_KEYS.length).toBeGreaterThan(300);
    expect(EN_KEYS).toContain('bookings.detailsStep.signInPromptTitle');
  });

  it('ignores non-string leaves rather than reporting them as keys', () => {
    expect(keyPaths({ a: 1, b: true, c: null, d: 'real' })).toEqual(['d']);
  });
});
