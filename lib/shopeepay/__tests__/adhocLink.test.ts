/**
 * Unit tests for the pure logic in lib/shopeepay/adhocLink.ts.
 *
 * The DB-touching helpers (markPaymentLinkPaid, finalizeAdhocPaid) are covered
 * by the guarded-update assertions below plus the live webhook integration run;
 * these tests pin the parts that are pure and easy to regress silently — the
 * code pattern and the escalation banner.
 */
import {
  LINK_CODE_PATTERN,
  composeAdhocPaidLineMessage,
  composeAdhocFailedLineMessage,
  markPaymentLinkPaid,
  type PaymentLinkRow,
} from '../adhocLink';

const link: PaymentLinkRow = {
  id: 'aaaaaaaa-0000-0000-0000-000000000000',
  link_code: 'PL-20260803-A7K2',
  customer_id: 'cccccccc-0000-0000-0000-000000000000',
  customer_name: 'Waii Executive Party',
  description: 'Deposit for private party, 15 Aug',
  amount: 500000, // ฿5,000.00
  currency: 'THB',
  status: 'pending',
  expires_at: null,
  paid_at: null,
  created_by: 'staff@len.golf',
  created_at: '2026-08-03T00:00:00Z',
};

describe('LINK_CODE_PATTERN', () => {
  it('accepts a well-formed PL code', () => {
    expect(LINK_CODE_PATTERN.test('PL-20260803-A7K2')).toBe(true);
  });

  it('never collides with the club-rental (CR-) or order (CRO-) code spaces', () => {
    // This is the invariant that lets /p/<code> dispatch on the prefix alone.
    expect(LINK_CODE_PATTERN.test('CR-20260803-A7K2')).toBe(false);
    expect(LINK_CODE_PATTERN.test('CRO-20260803-A7K2')).toBe(false);
  });

  it('rejects malformed codes', () => {
    expect(LINK_CODE_PATTERN.test('PL-2026080-A7K2')).toBe(false); // short date
    expect(LINK_CODE_PATTERN.test('PL-20260803-A7K')).toBe(false); // short suffix
    expect(LINK_CODE_PATTERN.test('PL-20260803-a7k2')).toBe(false); // lowercase
    expect(LINK_CODE_PATTERN.test('PL-20260803-A7K2 ')).toBe(false); // trailing space
    expect(LINK_CODE_PATTERN.test('')).toBe(false);
  });
});

describe('composeAdhocPaidLineMessage', () => {
  it('renders a normal payment without the escalation banner', () => {
    const msg = composeAdhocPaidLineMessage({ link, previousStatus: 'pending' });
    expect(msg).toContain('DEPOSIT / PAYMENT RECEIVED');
    expect(msg).toContain('PL-20260803-A7K2');
    expect(msg).toContain('Waii Executive Party');
    expect(msg).toContain('Deposit for private party, 15 Aug');
    expect(msg).toContain('฿5,000.00');
    expect(msg).not.toContain('⚠️');
    expect(msg).not.toContain('Refund manually');
  });

  it.each(['cancelled', 'expired', 'failed'])(
    'escalates loudly when money lands on a %s link',
    (previousStatus) => {
      // The load-bearing case: ShopeePay has no cancel-order API, so a link we
      // wrote off can still be paid. We take the money and shout about it.
      const msg = composeAdhocPaidLineMessage({ link, previousStatus });
      expect(msg).toContain('⚠️');
      expect(msg).toContain(previousStatus.toUpperCase());
      expect(msg).toContain('Refund manually');
      // The payment is still reported as received, not as an error.
      expect(msg).toContain('฿5,000.00');
    }
  );

  it('quotes the ShopeePay transaction_sn when present', () => {
    const msg = composeAdhocPaidLineMessage({
      link,
      previousStatus: 'pending',
      transactionSn: 'SN-12345',
    });
    expect(msg).toContain('SN-12345');
  });

  it('applies the [UAT] prefix only outside production', () => {
    expect(composeAdhocPaidLineMessage({ link, previousStatus: 'pending', uatPrefix: true })).toMatch(/^\[UAT\] /);
    expect(composeAdhocPaidLineMessage({ link, previousStatus: 'pending', uatPrefix: false })).not.toMatch(/^\[UAT\] /);
  });

  it('formats satang to THB with two decimals', () => {
    expect(composeAdhocPaidLineMessage({ link: { ...link, amount: 100 }, previousStatus: 'pending' })).toContain('฿1.00');
    expect(composeAdhocPaidLineMessage({ link: { ...link, amount: 123456 }, previousStatus: 'pending' })).toContain('฿1,234.56');
    expect(composeAdhocPaidLineMessage({ link: { ...link, amount: 20000000 }, previousStatus: 'pending' })).toContain('฿200,000.00');
  });
});

describe('composeAdhocFailedLineMessage', () => {
  it('reports the decline with the gateway reason', () => {
    const msg = composeAdhocFailedLineMessage({ link, reason: 'declined by issuer' });
    expect(msg).toContain('DECLINED');
    expect(msg).toContain('PL-20260803-A7K2');
    expect(msg).toContain('declined by issuer');
  });

  it('omits the reason line when the gateway gave none', () => {
    expect(composeAdhocFailedLineMessage({ link, reason: null })).not.toContain('Reason:');
  });
});

describe('markPaymentLinkPaid', () => {
  /** Records the filter chain so we can assert the guard, like the forms-side fakeAdmin. */
  function fakeAdmin(updateResult: unknown) {
    const calls: { table: string; op: string; values?: unknown; filters: [string, string][] }[] = [];
    return {
      calls,
      from(table: string) {
        const rec: { table: string; op: string; values?: unknown; filters: [string, string][] } = {
          table,
          op: 'select',
          filters: [],
        };
        calls.push(rec);
        const chain: Record<string, unknown> = {
          select: () => chain,
          update: (values: unknown) => {
            rec.op = 'update';
            rec.values = values;
            return chain;
          },
          eq: (c: string, v: string) => {
            rec.filters.push(['eq:' + c, v]);
            return chain;
          },
          neq: (c: string, v: string) => {
            rec.filters.push(['neq:' + c, v]);
            return chain;
          },
          maybeSingle: async () =>
            rec.op === 'update' ? { data: updateResult, error: null } : { data: link, error: null },
        };
        return chain;
      },
    };
  }

  it('guards with neq(status,paid) so two write paths cannot both win', async () => {
    // The webhook and the /transaction/check poll can both confirm the same
    // payment. neq — not eq('pending') — is what makes the loser a no-op AND
    // still lets a cancelled/expired link be flipped (money must never drop).
    const admin = fakeAdmin({ ...link, status: 'paid' });
    await markPaymentLinkPaid(admin as never, link.id);

    const update = admin.calls.find((c) => c.op === 'update');
    expect(update?.table).toBe('payment_links');
    expect(update?.filters).toContainEqual(['eq:id', link.id]);
    expect(update?.filters).toContainEqual(['neq:status', 'paid']);
    expect((update?.values as { status: string }).status).toBe('paid');
  });

  it('reports flipped=null on an idempotent replay so no second notification fires', async () => {
    const admin = fakeAdmin(null); // update matched zero rows => already paid
    const res = await markPaymentLinkPaid(admin as never, link.id);
    expect(res.flipped).toBeNull();
  });

  it('reports the pre-flip status so the caller can escalate', async () => {
    const admin = fakeAdmin({ ...link, status: 'paid' });
    const res = await markPaymentLinkPaid(admin as never, link.id);
    expect(res.previousStatus).toBe('pending');
  });
});
