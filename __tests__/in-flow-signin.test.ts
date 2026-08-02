import { localePath } from '@/i18n/locale-path';
import {
  saveContactDraft,
  takeContactDraft,
  clearContactDraft,
} from '@/app/[locale]/(features)/bookings/components/booking/steps/details/contactDraft';

describe('localePath', () => {
  // Under `localePrefix: 'as-needed'` the default locale is UNPREFIXED.
  // Getting this backwards produces /en/bookings, or silently returns a Thai
  // customer to the English page after signing in.
  it('leaves the default locale unprefixed', () => {
    expect(localePath('/bookings', 'en')).toBe('/bookings');
  });

  it.each([
    ['th', '/th/bookings'],
    ['ko', '/ko/bookings'],
    ['ja', '/ja/bookings'],
    ['zh', '/zh/bookings'],
  ])('prefixes %s', (locale, expected) => {
    expect(localePath('/bookings', locale)).toBe(expected);
  });

  it('returns the path untouched for an unknown locale rather than inventing a 404', () => {
    expect(localePath('/bookings', 'xx')).toBe('/bookings');
  });

  it('refuses a non-absolute path', () => {
    expect(() => localePath('bookings', 'th')).toThrow();
  });

  // The callbackUrl this builds must never carry a query string: useBookingFlow
  // treats selectDate/package/club as a deep link and skips its sessionStorage
  // restore, which would discard the in-progress booking on the way back.
  it.each(['en', 'th', 'ko', 'ja', 'zh'])('produces a query-free callbackUrl for %s', (locale) => {
    const url = localePath('/bookings', locale);
    expect(url).not.toContain('?');
    expect(url).not.toContain('&');
    expect(url.endsWith('/bookings')).toBe(true);
  });
});

describe('contactDraft', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('round-trips what the customer typed', () => {
    saveContactDraft({ name: 'Somchai', email: 's@example.com', phoneNumber: '+66842695447' });
    expect(takeContactDraft()).toEqual({
      name: 'Somchai',
      email: 's@example.com',
      phoneNumber: '+66842695447',
    });
  });

  // Single-use by design. The draft exists to survive ONE redirect; leaving it
  // behind would let a stale copy repopulate fields on a later visit.
  it('clears itself on read', () => {
    saveContactDraft({ name: 'Somchai', email: '', phoneNumber: undefined });
    expect(takeContactDraft()).not.toBeNull();
    expect(takeContactDraft()).toBeNull();
  });

  // An empty draft would otherwise be read back as a real one and could be used
  // to blank out fields that prefill had legitimately populated.
  it('stores nothing when every field is empty', () => {
    saveContactDraft({ name: '', email: '', phoneNumber: undefined });
    expect(takeContactDraft()).toBeNull();
  });

  it('survives a partially filled form', () => {
    saveContactDraft({ name: 'Somchai', email: '', phoneNumber: undefined });
    expect(takeContactDraft()).toEqual({ name: 'Somchai', email: '', phoneNumber: undefined });
  });

  it('drops malformed storage rather than throwing during a render', () => {
    window.sessionStorage.setItem('lengolf.bayBookingContact', '{not json');
    expect(takeContactDraft()).toBeNull();
    // and does not leave the bad value behind to fail again next time
    expect(window.sessionStorage.getItem('lengolf.bayBookingContact')).toBeNull();
  });

  it('coerces unexpected field types instead of trusting them', () => {
    window.sessionStorage.setItem(
      'lengolf.bayBookingContact',
      JSON.stringify({ name: 42, email: null, phoneNumber: { nope: true } })
    );
    expect(takeContactDraft()).toEqual({ name: '', email: '', phoneNumber: undefined });
  });

  it('clearContactDraft removes a pending draft', () => {
    saveContactDraft({ name: 'Somchai', email: 's@example.com', phoneNumber: undefined });
    clearContactDraft();
    expect(takeContactDraft()).toBeNull();
  });
});
