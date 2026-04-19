import { isValidLocale, routing } from '@/i18n/routing';

describe('isValidLocale', () => {
  it.each(['en', 'th', 'ko', 'ja', 'zh'])(
    'accepts supported locale %s',
    (loc) => {
      expect(isValidLocale(loc)).toBe(true);
    }
  );

  it.each(['xx', 'EN', '', 'en-US', 'th-TH', 'fr', 'de', '  ', 'eng'])(
    'rejects unsupported locale %p',
    (value) => {
      expect(isValidLocale(value)).toBe(false);
    }
  );

  it('matches the routing.locales array exactly', () => {
    // Guards against a future refactor that removes locales from `routing`
    // but forgets to update isValidLocale, or vice versa.
    for (const loc of routing.locales) {
      expect(isValidLocale(loc)).toBe(true);
    }
  });
});
