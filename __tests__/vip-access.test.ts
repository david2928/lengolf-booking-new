import { vipAccess, denyVipAccess } from '@/lib/auth/vip-access';

/**
 * The guest credentials provider resolves an existing profile on EMAIL ALONE.
 * So a guest session is not proof of identity: anyone who knows an address can
 * obtain one carrying that person's profile id, and every VIP route resolves
 * `session.user.id` to a `customer_id` and returns what hangs off it.
 *
 * The routes scope correctly. It is the SESSION that is untrusted, which is why
 * this gate exists on top of the per-record scoping rather than instead of it.
 */
describe('vipAccess', () => {
  it('allows a real provider session', () => {
    expect(vipAccess({ user: { id: 'p1', provider: 'google' } })).toBe('ok');
    expect(vipAccess({ user: { id: 'p1', provider: 'line' } })).toBe('ok');
    expect(vipAccess({ user: { id: 'p1', provider: 'facebook' } })).toBe('ok');
  });

  it('refuses a guest session', () => {
    expect(vipAccess({ user: { id: 'p1', provider: 'guest' } })).toBe('guest');
  });

  it.each([
    ['null session', null],
    ['undefined session', undefined],
    ['no user', {}],
    ['user without id', { user: { provider: 'google' } }],
    ['empty id', { user: { id: '', provider: 'google' } }],
  ])('treats %s as unauthenticated', (_label, session) => {
    expect(vipAccess(session as never)).toBe('unauthenticated');
  });

  // An unknown provider is not a guest, so it must not be silently refused —
  // that would break every customer the moment a provider is added.
  it('does not refuse an unrecognised provider', () => {
    expect(vipAccess({ user: { id: 'p1', provider: 'apple' } })).toBe('ok');
  });

  // The check is on the exact string. Anything looser risks a future provider
  // named e.g. 'guest-checkout' being caught, or 'Guest' slipping through.
  it('matches the provider exactly, not loosely', () => {
    expect(vipAccess({ user: { id: 'p1', provider: 'Guest' } })).toBe('ok');
    expect(vipAccess({ user: { id: 'p1', provider: 'guestbook' } })).toBe('ok');
  });
});

describe('denyVipAccess', () => {
  it('returns null for a real session, so the handler continues', () => {
    expect(denyVipAccess({ user: { id: 'p1', provider: 'google' } })).toBeNull();
  });

  it('401s an unauthenticated caller', async () => {
    const res = denyVipAccess(null);
    expect(res?.status).toBe(401);
  });

  // 403 rather than 401 is deliberate: a guest IS authenticated, and signing in
  // again as a guest cannot help. Collapsing both to 401 would send the client
  // into a sign-in loop that can never succeed.
  it('403s a guest, and says why', async () => {
    const res = denyVipAccess({ user: { id: 'p1', provider: 'guest' } });
    expect(res?.status).toBe(403);
    await expect(res?.json()).resolves.toMatchObject({
      code: 'GUEST_SESSION_NOT_ELIGIBLE',
    });
  });

  it('does not leak whether the profile exists', async () => {
    const res = denyVipAccess({ user: { id: 'p1', provider: 'guest' } });
    const body = await res?.json();
    expect(JSON.stringify(body)).not.toContain('p1');
  });
});
