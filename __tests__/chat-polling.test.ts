import { mergeMessages, diffNew, countUnread } from '@/lib/chatPolling';

type TestMsg = {
  id: string;
  created_at: string;
  sender_type: 'customer' | 'bot' | 'staff';
  is_read: boolean;
};

const msg = (
  id: string,
  created_at: string,
  overrides: Partial<TestMsg> = {}
): TestMsg => ({
  id,
  created_at,
  sender_type: 'customer',
  is_read: true,
  ...overrides,
});

describe('mergeMessages', () => {
  it('unions by id and sorts by created_at ascending', () => {
    const prev = [msg('a', '2026-07-20T10:00:00Z')];
    const incoming = [
      msg('b', '2026-07-20T10:02:00Z', { sender_type: 'staff' }),
      msg('a', '2026-07-20T10:00:00Z'),
    ];
    const merged = mergeMessages(prev, incoming);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('keeps prev-only messages (e.g. rows older than the server window)', () => {
    const prev = [msg('old', '2026-07-20T09:00:00Z')];
    const incoming = [msg('new', '2026-07-20T10:00:00Z')];
    expect(mergeMessages(prev, incoming).map((m) => m.id)).toEqual(['old', 'new']);
  });

  it('server copy wins over local copy with the same id', () => {
    const prev = [msg('a', '2026-07-20T10:00:00Z', { is_read: false })];
    const incoming = [msg('a', '2026-07-20T10:00:00Z', { is_read: true })];
    expect(mergeMessages(prev, incoming)[0].is_read).toBe(true);
  });

  it('sorts deterministically by id when created_at is identical', () => {
    const timestamp = '2026-07-20T10:00:00Z';
    const prev = [msg('z', timestamp), msg('a', timestamp)];
    const incoming = [msg('m', timestamp)];
    const merged1 = mergeMessages(prev, incoming);
    const merged2 = mergeMessages([msg('a', timestamp), msg('z', timestamp)], [msg('m', timestamp)]);
    expect(merged1.map((m) => m.id)).toEqual(['a', 'm', 'z']);
    expect(merged2.map((m) => m.id)).toEqual(['a', 'm', 'z']);
  });

  it('returns empty array when both prev and incoming are empty', () => {
    expect(mergeMessages([], [])).toEqual([]);
  });
});

describe('diffNew', () => {
  it('returns only incoming messages not present in prev', () => {
    const prev = [msg('a', '2026-07-20T10:00:00Z')];
    const incoming = [
      msg('a', '2026-07-20T10:00:00Z'),
      msg('b', '2026-07-20T10:01:00Z', { sender_type: 'bot' }),
    ];
    expect(diffNew(prev, incoming).map((m) => m.id)).toEqual(['b']);
  });

  it('returns empty array when nothing is new', () => {
    const prev = [msg('a', '2026-07-20T10:00:00Z')];
    expect(diffNew(prev, [msg('a', '2026-07-20T10:00:00Z')])).toEqual([]);
  });
});

describe('countUnread', () => {
  it('counts unread non-customer messages only', () => {
    const messages = [
      msg('a', '2026-07-20T10:00:00Z', { sender_type: 'customer', is_read: false }),
      msg('b', '2026-07-20T10:01:00Z', { sender_type: 'staff', is_read: false }),
      msg('c', '2026-07-20T10:02:00Z', { sender_type: 'bot', is_read: false }),
      msg('d', '2026-07-20T10:03:00Z', { sender_type: 'staff', is_read: true }),
    ];
    expect(countUnread(messages)).toBe(2);
  });

  it('returns 0 for empty message list', () => {
    expect(countUnread([])).toBe(0);
  });
});
