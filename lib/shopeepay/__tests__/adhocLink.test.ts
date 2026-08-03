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
  link_code: 'PL-20260803-A7K2B9C1',
  customer_id: 'cccccccc-0000-0000-0000-000000000000',
  customer_name: 'Waii Executive Party',
  description: 'Deposit for private party, 15 Aug',
  amount: 500000, // ฿5,000.00
  currency: 'THB',
  status: 'pending',
  expires_at: null,
  paid_at: null,
  cancelled_at: null,
  created_by: 'staff@len.golf',
  created_at: '2026-08-03T00:00:00Z',
};

describe('LINK_CODE_PATTERN', () => {
  it('accepts a well-formed PL code', () => {
    expect(LINK_CODE_PATTERN.test('PL-20260803-A7K2B9C1')).toBe(true);
  });

  it('never collides with the club-rental (CR-) or order (CRO-) code spaces', () => {
    // This is the invariant that lets /p/<code> dispatch on the prefix alone.
    expect(LINK_CODE_PATTERN.test('CR-20260803-A7K2B9C1')).toBe(false);
    expect(LINK_CODE_PATTERN.test('CRO-20260803-A7K2B9C1')).toBe(false);
  });

  it('rejects malformed codes', () => {
    expect(LINK_CODE_PATTERN.test('PL-2026080-A7K2')).toBe(false); // short date
    expect(LINK_CODE_PATTERN.test('PL-20260803-A7K')).toBe(false); // short suffix
    expect(LINK_CODE_PATTERN.test('PL-20260803-a7k2')).toBe(false); // lowercase
    expect(LINK_CODE_PATTERN.test('PL-20260803-A7K2B9C1 ')).toBe(false); // trailing space
    expect(LINK_CODE_PATTERN.test('')).toBe(false);
  });
});

describe('composeAdhocPaidLineMessage', () => {
  it('renders a normal payment without the escalation banner', () => {
    const msg = composeAdhocPaidLineMessage({ link, previousStatus: 'pending' });
    expect(msg).toContain('DEPOSIT / PAYMENT RECEIVED');
    expect(msg).toContain('PL-20260803-A7K2B9C1');
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
    expect(msg).toContain('PL-20260803-A7K2B9C1');
    expect(msg).toContain('declined by issuer');
  });

  it('omits the reason line when the gateway gave none', () => {
    expect(composeAdhocFailedLineMessage({ link, reason: null })).not.toContain('Reason:');
  });
});

describe('markPaymentLinkPaid', () => {
  type Rec = { table: string; op: string; values?: unknown; filters: [string, unknown][] }

  /**
   * `steps` supplies the result of each successive UPDATE, so we can model the
   * two-step guarded flip: step 1 is eq(status,'pending'), step 2 is
   * neq(status,'paid').
   */
  function fakeAdmin(steps: unknown[]) {
    const calls: Rec[] = []
    let updateIdx = 0
    return {
      calls,
      from(table: string) {
        const rec: Rec = { table, op: 'select', filters: [] }
        calls.push(rec)
        const chain: Record<string, unknown> = {
          select: () => chain,
          update: (values: unknown) => {
            rec.op = 'update'
            rec.values = values
            return chain
          },
          eq: (c: string, v: unknown) => {
            rec.filters.push(['eq:' + c, v])
            return chain
          },
          neq: (c: string, v: unknown) => {
            rec.filters.push(['neq:' + c, v])
            return chain
          },
          maybeSingle: async () =>
            rec.op === 'update'
              ? { data: steps[updateIdx++] ?? null, error: null }
              : { data: link, error: null },
        }
        return chain
      },
    }
  }

  it('tries the live guard first and reports previousStatus=pending on a win', async () => {
    const admin = fakeAdmin([{ ...link, status: 'paid' }])
    const res = await markPaymentLinkPaid(admin as never, link.id)

    const first = admin.calls.find((c) => c.op === 'update')!
    expect(first.table).toBe('payment_links')
    expect(first.filters).toContainEqual(['eq:id', link.id])
    expect(first.filters).toContainEqual(['eq:status', 'pending'])
    expect(res.previousStatus).toBe('pending')
    expect(res.flipped).not.toBeNull()
  })

  it('does NOT derive previousStatus from a separate pre-read', async () => {
    // A pre-read races the very thing the escalation banner exists to catch:
    // a cancel committing between SELECT and UPDATE would be reported as
    // 'pending' and staff would never learn money hit a written-off link.
    const admin = fakeAdmin([{ ...link, status: 'paid' }])
    await markPaymentLinkPaid(admin as never, link.id)
    expect(admin.calls.filter((c) => c.op === 'select')).toHaveLength(0)
  })

  it('falls back to neq(status,paid) so money is never dropped on a dead link', async () => {
    // Step 1 misses (not pending); step 2 wins => a late arrival.
    const admin = fakeAdmin([null, { ...link, status: 'paid', cancelled_at: '2026-08-03T01:00:00Z' }])
    const res = await markPaymentLinkPaid(admin as never, link.id)

    const updates = admin.calls.filter((c) => c.op === 'update')
    expect(updates).toHaveLength(2)
    expect(updates[1].filters).toContainEqual(['neq:status', 'paid'])
    expect(res.flipped).not.toBeNull()
    // cancelled_at survives the paid flip, so it distinguishes a staff cancel
    // from a cron expiry — and drives the escalation wording.
    expect(res.previousStatus).toBe('cancelled')
  })

  it('classifies a late arrival with no cancelled_at as an expiry', async () => {
    const admin = fakeAdmin([null, { ...link, status: 'paid', cancelled_at: null }])
    const res = await markPaymentLinkPaid(admin as never, link.id)
    expect(res.previousStatus).toBe('expired')
  })

  it('reports flipped=null on an idempotent replay so no second notification fires', async () => {
    // Both guards miss => already paid.
    const admin = fakeAdmin([null, null])
    const res = await markPaymentLinkPaid(admin as never, link.id)
    expect(res.flipped).toBeNull()
    expect(res.previousStatus).toBe('paid')
  })
})
