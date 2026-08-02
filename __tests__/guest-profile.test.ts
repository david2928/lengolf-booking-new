import { buildGuestProfileUpdate, isBlank } from '@/lib/auth/guest-profile';

const NOW = '2026-08-01T00:00:00.000Z';

/**
 * Guest sign-in resolves an existing profile on EMAIL ALONE. Name and phone are
 * written, not checked. Before this rule, supplying someone's email with any
 * name and phone rewrote their stored identity — 1,210 guest profiles were
 * reachable that way.
 */
describe('buildGuestProfileUpdate', () => {
  const supplied = { suppliedName: 'Attacker Name', suppliedPhone: '+66900000000' };

  it('never overwrites a stored name or phone', () => {
    const update = buildGuestProfileUpdate({
      stored: { display_name: 'Somchai Preecha', phone_number: '+66842695447' },
      ...supplied,
      marketingOptIn: false,
      now: NOW,
    });

    expect(update).not.toHaveProperty('display_name');
    expect(update).not.toHaveProperty('phone_number');
    expect(update.updated_at).toBe(NOW);
  });

  it('fills both fields when the profile has neither', () => {
    const update = buildGuestProfileUpdate({
      stored: { display_name: null, phone_number: null },
      ...supplied,
      marketingOptIn: false,
      now: NOW,
    });

    expect(update.display_name).toBe('Attacker Name');
    expect(update.phone_number).toBe('+66900000000');
  });

  // Per-field, not all-or-nothing: a profile with a name but no phone should
  // still gain the phone.
  it('fills only the field that is blank', () => {
    const update = buildGuestProfileUpdate({
      stored: { display_name: 'Somchai Preecha', phone_number: null },
      ...supplied,
      marketingOptIn: false,
      now: NOW,
    });

    expect(update).not.toHaveProperty('display_name');
    expect(update.phone_number).toBe('+66900000000');
  });

  // The edges where a "is it empty?" rule usually breaks.
  it.each([
    ['empty string', ''],
    ['single space', ' '],
    ['whitespace run', '   \t  '],
    ['undefined', undefined],
    ['null', null],
  ])('treats %s as blank and fills it', (_label, stored) => {
    const update = buildGuestProfileUpdate({
      stored: { display_name: stored, phone_number: stored },
      ...supplied,
      marketingOptIn: false,
      now: NOW,
    });

    expect(update.display_name).toBe('Attacker Name');
    expect(update.phone_number).toBe('+66900000000');
  });

  it('does not treat a real value as blank just because it is short', () => {
    const update = buildGuestProfileUpdate({
      stored: { display_name: 'Al', phone_number: '0' },
      ...supplied,
      marketingOptIn: false,
      now: NOW,
    });

    expect(update).not.toHaveProperty('display_name');
    expect(update).not.toHaveProperty('phone_number');
  });

  describe('marketing consent stays upgrade-only', () => {
    it('re-affirms on opt-in', () => {
      const update = buildGuestProfileUpdate({
        stored: { display_name: 'Somchai', phone_number: '+66842695447' },
        ...supplied,
        marketingOptIn: true,
        now: NOW,
      });

      expect(update.marketing_preference).toBe(true);
    });

    // An unticked box must never revoke a prior opt-in — omitting the key
    // leaves the stored value alone. Writing `false` here would silently
    // unsubscribe someone who consented earlier.
    it('never writes false', () => {
      const update = buildGuestProfileUpdate({
        stored: { display_name: 'Somchai', phone_number: '+66842695447' },
        ...supplied,
        marketingOptIn: false,
        now: NOW,
      });

      expect(update).not.toHaveProperty('marketing_preference');
    });
  });

  it('always advances updated_at, which is what makes the duplicate-email lookup stable', () => {
    const update = buildGuestProfileUpdate({
      stored: { display_name: 'Somchai', phone_number: '+66842695447' },
      ...supplied,
      marketingOptIn: false,
      now: NOW,
    });

    // Even with nothing else to write. The lookup orders by updated_at desc and
    // takes one row; touching the row it picked keeps that choice stable
    // instead of alternating between duplicates.
    expect(Object.keys(update)).toEqual(['updated_at']);
  });
});

describe('isBlank', () => {
  it.each([null, undefined, '', ' ', '\t', '\n  '])('treats %p as blank', (v) => {
    expect(isBlank(v as string | null | undefined)).toBe(true);
  });

  it.each(['a', '0', ' x ', 'Somchai'])('treats %p as present', (v) => {
    expect(isBlank(v)).toBe(false);
  });
});
