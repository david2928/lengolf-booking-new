/**
 * Tests the Opn failure_code → our FailureReason taxonomy mapping.
 * Keep parity with the ShopeePay UI's four-value vocabulary
 * (declined | cancelled | expired | unknown) so /payment/return
 * uses the same component.
 */
import { classifyFailure, type FailureReason } from '@/lib/opn/types';

describe('classifyFailure — Opn failure_code mapping', () => {
  const cases: Array<[string | null | undefined, FailureReason]> = [
    // Declined family — issuer rejected
    ['insufficient_fund', 'declined'],
    ['insufficient_balance', 'declined'],
    ['stolen_or_lost_card', 'declined'],
    ['payment_rejected', 'declined'],
    ['confirmed_amount_mismatch', 'declined'],
    // Cancelled — user-initiated
    ['payment_cancelled', 'cancelled'],
    // Unknown family — gateway/processing failures (retry-safe)
    ['failed_processing', 'unknown'],
    ['timeout', 'unknown'],
    ['failed_fraud_check', 'unknown'],
    // Unrecognized codes fall through to 'unknown'
    ['some_new_code_opn_added', 'unknown'],
    ['', 'unknown'],
    // Null/undefined → unknown (caller must use 'expired' separately
    // for the "still pending past budget" case; this fn doesn't infer)
    [null, 'unknown'],
    [undefined, 'unknown'],
  ];

  cases.forEach(([input, expected]) => {
    it(`maps ${JSON.stringify(input)} → ${expected}`, () => {
      expect(classifyFailure(input)).toBe(expected);
    });
  });
});
