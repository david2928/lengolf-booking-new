/**
 * The profile write-back decision on booking submit.
 *
 * Two things that look the same and are not: OVERWRITING a contact value the
 * customer already has on file (needs the "also update my account" tick) versus
 * FILLING one that was blank (does not — nothing is lost, and refusing means we
 * stop capturing emails from LINE customers, who are the population least
 * likely to have one stored and, because the identity card is all-or-nothing,
 * the least likely to ever see the tick).
 *
 * These cases are the reason `shouldWriteProfile` is a pure function over two
 * plain objects instead of an inline `&&` inside `handleSubmit`.
 */
import {
  shouldWriteProfile,
  profileNeedsUpdate,
  type ProfileContactSnapshot,
} from '@/app/[locale]/(features)/bookings/components/booking/steps/details/profileWriteBack';

/** A fully-populated returning customer. */
const complete: ProfileContactSnapshot = {
  name: 'Somchai Prasert',
  display_name: 'Somchai Prasert',
  email: 'somchai@example.com',
  phone_number: '+66812345678',
};

const asEntered = {
  name: 'Somchai Prasert',
  email: 'somchai@example.com',
  phoneNumber: '+66812345678' as string | undefined,
};

describe('shouldWriteProfile', () => {
  test('does not write when nothing differs', () => {
    expect(
      shouldWriteProfile({ profile: complete, ...asEntered, alsoUpdateAccount: false }),
    ).toBe(false);
    // Ticking the box does not conjure a write out of an identical form.
    expect(
      shouldWriteProfile({ profile: complete, ...asEntered, alsoUpdateAccount: true }),
    ).toBe(false);
  });

  test('writes unticked when the only field that differs was blank (LINE user, no stored email)', () => {
    const noEmail: ProfileContactSnapshot = { ...complete, email: '' };
    expect(
      shouldWriteProfile({ profile: noEmail, ...asEntered, alsoUpdateAccount: false }),
    ).toBe(true);
  });

  test('writes unticked when the blank field is null rather than empty string', () => {
    const noPhone: ProfileContactSnapshot = { ...complete, phone_number: null };
    expect(
      shouldWriteProfile({ profile: noPhone, ...asEntered, alsoUpdateAccount: false }),
    ).toBe(true);
  });

  test('treats a whitespace-only stored value as blank', () => {
    const blankishEmail: ProfileContactSnapshot = { ...complete, email: '   ' };
    expect(
      shouldWriteProfile({ profile: blankishEmail, ...asEntered, alsoUpdateAccount: false }),
    ).toBe(true);
  });

  test('writes unticked when several fields differ and all of them were blank', () => {
    const bare: ProfileContactSnapshot = {
      name: '',
      display_name: '',
      email: null,
      phone_number: null,
    };
    expect(
      shouldWriteProfile({ profile: bare, ...asEntered, alsoUpdateAccount: false }),
    ).toBe(true);
  });

  test('does NOT write unticked when a non-blank field differs (one-off booking contact)', () => {
    expect(
      shouldWriteProfile({
        profile: complete,
        ...asEntered,
        phoneNumber: '+66899999999',
        alsoUpdateAccount: false,
      }),
    ).toBe(false);
  });

  test('does NOT write unticked when a blank fill is mixed with a non-blank overwrite', () => {
    // Email would be a legitimate fill, but the phone change is an overwrite,
    // and we refuse the whole statement rather than write a partial one.
    const noEmail: ProfileContactSnapshot = { ...complete, email: '' };
    expect(
      shouldWriteProfile({
        profile: noEmail,
        ...asEntered,
        phoneNumber: '+66899999999',
        alsoUpdateAccount: false,
      }),
    ).toBe(false);
  });

  test('writes when a non-blank field differs and the box is ticked', () => {
    expect(
      shouldWriteProfile({
        profile: complete,
        ...asEntered,
        phoneNumber: '+66899999999',
        alsoUpdateAccount: true,
      }),
    ).toBe(true);
  });

  test('does not write when there is no profile row, ticked or not', () => {
    expect(
      shouldWriteProfile({ profile: null, ...asEntered, alsoUpdateAccount: false }),
    ).toBe(false);
    expect(
      shouldWriteProfile({ profile: null, ...asEntered, alsoUpdateAccount: true }),
    ).toBe(false);
  });

  /**
   * `name` is written to the `display_name` column — there is no `name` column;
   * `profile.name` is a local mirror populated from `display_name` when the row
   * is fetched. So a name change is judged against `display_name`, and a blank
   * mirror alongside a real `display_name` is a stale mirror, not a blank field.
   */
  describe('display_name semantics', () => {
    test('a name change over a real display_name is an OVERWRITE, so it needs the tick', () => {
      const staleMirror: ProfileContactSnapshot = { ...complete, name: '' };
      expect(
        shouldWriteProfile({
          profile: staleMirror,
          ...asEntered,
          name: 'Somchai P.',
          alsoUpdateAccount: false,
        }),
      ).toBe(false);
      expect(
        shouldWriteProfile({
          profile: staleMirror,
          ...asEntered,
          name: 'Somchai P.',
          alsoUpdateAccount: true,
        }),
      ).toBe(true);
    });

    test('a name typed over a blank display_name is a FILL', () => {
      const noName: ProfileContactSnapshot = { ...complete, name: '', display_name: '' };
      expect(
        shouldWriteProfile({ profile: noName, ...asEntered, alsoUpdateAccount: false }),
      ).toBe(true);
    });

    test('mirror-only drift writes nothing, because no column would change', () => {
      // profile.name is stale but display_name already equals what was entered,
      // and email/phone match — the update would only move `updated_at`.
      const staleMirror: ProfileContactSnapshot = { ...complete, name: '' };
      expect(profileNeedsUpdate({ profile: staleMirror, ...asEntered })).toBe(true);
      expect(
        shouldWriteProfile({ profile: staleMirror, ...asEntered, alsoUpdateAccount: false }),
      ).toBe(false);
    });
  });
});

describe('profileNeedsUpdate', () => {
  test('is false without a profile row', () => {
    expect(profileNeedsUpdate({ profile: null, ...asEntered })).toBe(false);
  });

  test('is false when every compared value matches', () => {
    expect(profileNeedsUpdate({ profile: complete, ...asEntered })).toBe(false);
  });

  test('is true for any single difference', () => {
    expect(
      profileNeedsUpdate({ profile: complete, ...asEntered, email: 'other@example.com' }),
    ).toBe(true);
  });
});
