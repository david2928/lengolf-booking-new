/**
 * Snapshot-style tests for the unified club-rental LINE message composer.
 *
 * Locks in the visual format so future changes (add a field, tweak an
 * emoji) deliberately update tests instead of silently drifting. Also
 * pins the state-specific bits (header, money line, footer) per
 * lifecycle event so a copy change in one state can't accidentally
 * affect another.
 */

import {
  composeRentalLineMessage,
  type RentalLineInput,
} from '@/lib/club-rental/lineMessage';

const baseRental: RentalLineInput['rental'] = {
  rental_code: 'CR-20260524-5061',
  customer_name: 'David Geiermann',
  customer_phone: '+66842695447',
  customer_email: 'dgeiermann@gmail.com',
  start_date: '2026-07-31',
  end_date: '2026-08-01',
  duration_days: 1,
  delivery_requested: false,
  delivery_address: null,
  delivery_time: '09:00',
  return_time: '19:00',
  total_price: '1200.00',
  notes: 'TEST',
  add_ons: null,
};

const baseClubSet: NonNullable<RentalLineInput['clubSet']> = {
  name: "Premium Men's - Callaway Warbird",
  tier: 'premium',
  gender: 'mens',
};

describe('composeRentalLineMessage — Created (online prepay)', () => {
  const msg = composeRentalLineMessage({
    rental: baseRental,
    clubSet: baseClubSet,
    status: { kind: 'Created', paymentMode: 'online' },
  });

  it('opens with the 📝 NEW CLUB RENTAL header bracketed by emoji', () => {
    expect(msg.split('\n')[0]).toBe(
      '📝 NEW CLUB RENTAL (ID: CR-20260524-5061) 📝'
    );
  });

  it('includes customer block in the canonical order', () => {
    const lines = msg.split('\n');
    const customerIdx = lines.findIndex(l => l.startsWith('👤 Customer:'));
    expect(lines[customerIdx + 1]).toBe('📞 Phone: +66842695447');
    expect(lines[customerIdx + 2]).toBe('📧 Email: dgeiermann@gmail.com');
  });

  it('closes with the "Awaiting ShopeePay" footer', () => {
    const lines = msg.split('\n');
    expect(lines[lines.length - 1]).toBe(
      '⌛ Awaiting ShopeePay payment — auto-cancels in 30 min if unpaid.'
    );
  });

  it('renders the pickup line, not delivery', () => {
    expect(msg).toContain('📍 Pickup at LENGOLF (Pickup: 09:00, Return: 19:00)');
    expect(msg).not.toContain('📍 Delivery to:');
  });
});

describe('composeRentalLineMessage — Created (manual payment)', () => {
  it('uses the manual-payment footer', () => {
    const msg = composeRentalLineMessage({
      rental: baseRental,
      clubSet: baseClubSet,
      status: { kind: 'Created', paymentMode: 'manual' },
    });
    expect(msg).toContain(
      '👉 Please contact the customer to confirm availability and arrange payment.'
    );
  });
});

describe('composeRentalLineMessage — Paid', () => {
  const msg = composeRentalLineMessage({
    rental: baseRental,
    clubSet: baseClubSet,
    status: { kind: 'Paid', transactionSn: '140387562504423746' },
  });

  it('opens with the ✅ PAYMENT RECEIVED header', () => {
    expect(msg.split('\n')[0]).toBe(
      '✅ PAYMENT RECEIVED (ID: CR-20260524-5061) ✅'
    );
  });

  it('shows total with PAID via ShopeePay', () => {
    expect(msg).toContain('💰 Total: ฿1,200 (PAID via ShopeePay)');
  });

  it('includes Txn line when transactionSn is provided', () => {
    expect(msg).toContain('🔖 Txn: 140387562504423746');
  });

  it('omits Txn line when transactionSn is missing', () => {
    const msgWithout = composeRentalLineMessage({
      rental: baseRental,
      clubSet: baseClubSet,
      status: { kind: 'Paid' },
    });
    expect(msgWithout).not.toContain('🔖 Txn:');
  });

  it('closes with prep-for-pickup footer', () => {
    const lines = msg.split('\n');
    expect(lines[lines.length - 1]).toBe(
      '👉 Booking confirmed — please prep clubs for pickup.'
    );
  });

  it('uses "delivery" in the footer when rental is delivery_requested', () => {
    const msgDelivery = composeRentalLineMessage({
      rental: { ...baseRental, delivery_requested: true, delivery_address: '123 Sukhumvit' },
      clubSet: baseClubSet,
      status: { kind: 'Paid', transactionSn: '...' },
    });
    expect(msgDelivery).toContain(
      '👉 Booking confirmed — please prep clubs for delivery.'
    );
    expect(msgDelivery).toContain('📍 Delivery to: 123 Sukhumvit');
  });
});

describe('composeRentalLineMessage — PaymentFailed', () => {
  it('opens with the ❌ header and includes the failure reason', () => {
    const msg = composeRentalLineMessage({
      rental: baseRental,
      clubSet: baseClubSet,
      status: { kind: 'PaymentFailed', reason: 'Card declined by issuer' },
    });
    expect(msg.split('\n')[0]).toBe(
      '❌ PAYMENT FAILED (ID: CR-20260524-5061) ❌'
    );
    expect(msg).toContain('⚠️ Failure reason: Card declined by issuer');
  });

  it('omits the failure-reason line when reason is missing', () => {
    const msg = composeRentalLineMessage({
      rental: baseRental,
      clubSet: baseClubSet,
      status: { kind: 'PaymentFailed' },
    });
    expect(msg).not.toContain('⚠️ Failure reason:');
  });
});

describe('composeRentalLineMessage — Refunded (full)', () => {
  const msg = composeRentalLineMessage({
    rental: baseRental,
    clubSet: baseClubSet,
    status: {
      kind: 'Refunded',
      refundedSatang: 120000,
      refundSn: '100206080757677246',
    },
  });

  it('opens with 🚫 RENTAL CANCELLED — REFUNDED header (matches bay-booking cancel style)', () => {
    expect(msg.split('\n')[0]).toBe(
      '🚫 RENTAL CANCELLED — REFUNDED (ID: CR-20260524-5061) 🚫'
    );
  });

  it('shows Original + Refunded amount lines', () => {
    expect(msg).toContain('💰 Original: ฿1,200');
    expect(msg).toContain('↩️ Refunded: ฿1,200 (Full)');
  });

  it('closes with the "released back to inventory" footer', () => {
    const lines = msg.split('\n');
    expect(lines[lines.length - 1]).toBe(
      '🗑️ Refunded via ShopeePay — clubs released back to inventory.'
    );
  });
});

describe('composeRentalLineMessage — PartiallyRefunded', () => {
  it('shows refunded-this-time and remaining-balance', () => {
    const msg = composeRentalLineMessage({
      rental: baseRental,
      clubSet: baseClubSet,
      status: {
        kind: 'PartiallyRefunded',
        refundedThisTimeSatang: 60000,
        totalRefundedSatang: 60000,
        refundSn: '...',
      },
    });
    expect(msg.split('\n')[0]).toBe(
      '↩️ PARTIAL REFUND (ID: CR-20260524-5061) ↩️'
    );
    expect(msg).toContain('💰 Original: ฿1,200');
    expect(msg).toContain('↩️ Refunded: ฿600 (Partial — ฿600 remaining)');
  });
});

describe('composeRentalLineMessage — Expired', () => {
  it('opens with ⌛ RENTAL EXPIRED — UNPAID and notes never-paid', () => {
    const msg = composeRentalLineMessage({
      rental: baseRental,
      clubSet: baseClubSet,
      status: { kind: 'Expired' },
    });
    expect(msg.split('\n')[0]).toBe(
      '⌛ RENTAL EXPIRED — UNPAID (ID: CR-20260524-5061) ⌛'
    );
    expect(msg).toContain('💰 Total: ฿1,200 (never paid)');
  });
});

describe('composeRentalLineMessage — UAT prefix', () => {
  it('prepends [UAT] to the header when uatPrefix=true', () => {
    const msg = composeRentalLineMessage({
      rental: baseRental,
      clubSet: baseClubSet,
      status: { kind: 'Paid', transactionSn: '...' },
      uatPrefix: true,
    });
    expect(msg.split('\n')[0]).toBe(
      '[UAT] ✅ PAYMENT RECEIVED (ID: CR-20260524-5061) ✅'
    );
  });

  it('omits prefix when uatPrefix=false (default)', () => {
    const msg = composeRentalLineMessage({
      rental: baseRental,
      clubSet: baseClubSet,
      status: { kind: 'Paid', transactionSn: '...' },
    });
    expect(msg.split('\n')[0].startsWith('[UAT]')).toBe(false);
  });
});

describe('composeRentalLineMessage — optional fields', () => {
  it('omits Phone line when customer_phone is null', () => {
    const msg = composeRentalLineMessage({
      rental: { ...baseRental, customer_phone: null },
      clubSet: baseClubSet,
      status: { kind: 'Created', paymentMode: 'online' },
    });
    expect(msg).not.toContain('📞 Phone:');
  });

  it('omits Email line when customer_email is null', () => {
    const msg = composeRentalLineMessage({
      rental: { ...baseRental, customer_email: null },
      clubSet: baseClubSet,
      status: { kind: 'Created', paymentMode: 'online' },
    });
    expect(msg).not.toContain('📧 Email:');
  });

  it('omits Set line when clubSet is missing', () => {
    const msg = composeRentalLineMessage({
      rental: baseRental,
      clubSet: null,
      status: { kind: 'Created', paymentMode: 'online' },
    });
    expect(msg).not.toContain('🏌️ Set:');
  });

  it('omits Notes line when notes is null', () => {
    const msg = composeRentalLineMessage({
      rental: { ...baseRental, notes: null },
      clubSet: baseClubSet,
      status: { kind: 'Created', paymentMode: 'online' },
    });
    expect(msg).not.toContain('📝 Notes:');
  });

  it('includes Add-ons line when present', () => {
    const msg = composeRentalLineMessage({
      rental: {
        ...baseRental,
        add_ons: [{ label: 'Extra dozen Pro V1', price: 200 }],
      },
      clubSet: baseClubSet,
      status: { kind: 'Created', paymentMode: 'online' },
    });
    expect(msg).toContain('🎒 Add-ons: Extra dozen Pro V1 (฿200)');
  });
});

describe('composeRentalLineMessage — multi-day rentals', () => {
  it('shows the duration in days when > 1', () => {
    const msg = composeRentalLineMessage({
      rental: {
        ...baseRental,
        start_date: '2026-07-31',
        end_date: '2026-08-03',
        duration_days: 3,
      },
      clubSet: baseClubSet,
      status: { kind: 'Created', paymentMode: 'online' },
    });
    expect(msg).toMatch(/🗓️ Dates:.* \(3d\)/);
  });
});

describe('composeRentalLineMessage — payment_method_chosen + contact_preference', () => {
  it('renders 💳 Payment + 💬 Contact lines when both fields are present', () => {
    const msg = composeRentalLineMessage({
      rental: {
        ...baseRental,
        payment_method_chosen: 'online_shopeepay',
        contact_preference: 'line',
      },
      clubSet: baseClubSet,
      status: { kind: 'Created', paymentMode: 'online' },
    });
    expect(msg).toContain('💬 Contact via: LINE');
    expect(msg).toContain('💳 Payment: Online (ShopeePay — card or wallet)');
  });

  it('places 💬 Contact line below email, above set', () => {
    const msg = composeRentalLineMessage({
      rental: {
        ...baseRental,
        payment_method_chosen: 'online_shopeepay',
        contact_preference: 'whatsapp',
      },
      clubSet: baseClubSet,
      status: { kind: 'Created', paymentMode: 'online' },
    });
    const lines = msg.split('\n');
    const emailIdx = lines.findIndex(l => l.startsWith('📧 Email:'));
    const contactIdx = lines.findIndex(l => l.startsWith('💬 Contact via:'));
    const setIdx = lines.findIndex(l => l.startsWith('🏌️ Set:'));
    expect(contactIdx).toBeGreaterThan(emailIdx);
    expect(contactIdx).toBeLessThan(setIdx);
  });

  it('renders cash_at_pickup label correctly', () => {
    const msg = composeRentalLineMessage({
      rental: { ...baseRental, payment_method_chosen: 'cash_at_pickup' },
      clubSet: baseClubSet,
      status: { kind: 'Created', paymentMode: 'manual' },
    });
    expect(msg).toContain('💳 Payment: Cash at pickup');
  });

  it('renders contact_preference variants (email, whatsapp)', () => {
    const msgEmail = composeRentalLineMessage({
      rental: { ...baseRental, contact_preference: 'email' },
      clubSet: baseClubSet,
      status: { kind: 'Created', paymentMode: 'online' },
    });
    expect(msgEmail).toContain('💬 Contact via: Email');

    const msgWa = composeRentalLineMessage({
      rental: { ...baseRental, contact_preference: 'whatsapp' },
      clubSet: baseClubSet,
      status: { kind: 'Created', paymentMode: 'online' },
    });
    expect(msgWa).toContain('💬 Contact via: WhatsApp');
  });

  it('omits both lines when neither field is set (legacy rentals)', () => {
    const msg = composeRentalLineMessage({
      rental: baseRental, // baseRental has neither field set
      clubSet: baseClubSet,
      status: { kind: 'Created', paymentMode: 'manual' },
    });
    expect(msg).not.toContain('💳 Payment:');
    expect(msg).not.toContain('💬 Contact via:');
  });

  it('omits the line for unknown payment_method_chosen / contact_preference values', () => {
    const msg = composeRentalLineMessage({
      rental: {
        ...baseRental,
        payment_method_chosen: 'futuristic_method_we_dont_know_yet',
        contact_preference: 'carrier_pigeon',
      },
      clubSet: baseClubSet,
      status: { kind: 'Created', paymentMode: 'online' },
    });
    expect(msg).not.toContain('💳 Payment:');
    expect(msg).not.toContain('💬 Contact via:');
  });
});

describe('composeRentalLineMessage — post-DROP line row (shared fields absent)', () => {
  it('renders without throwing and shows ? for the missing customer name', () => {
    // Only the columns that still exist on club_rentals after the 2026-07
    // column-DROP — the shared customer/delivery/notes fields are absent
    // (they live on the order header). Pins the degenerate resolver-miss
    // shape: composer must degrade gracefully, never print "undefined".
    const msg = composeRentalLineMessage({
      rental: {
        rental_code: 'CR-20260702-0001',
        start_date: '2026-07-31',
        end_date: '2026-08-01',
        duration_days: 1,
        return_time: '19:00',
        total_price: '1200.00',
      },
      clubSet: baseClubSet,
      status: { kind: 'Paid', transactionSn: '140387562504423746' },
    });
    expect(msg).toContain('👤 Customer: ?');
    expect(msg).not.toContain('undefined');
  });
});
