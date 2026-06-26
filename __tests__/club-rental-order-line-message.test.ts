import {
  composeOrderCreatedLineMessage,
  composeOrderPaidLineMessage,
} from '@/lib/club-rental/lineMessage';

const base = {
  order_code: 'CRO-20260625-AB12',
  customer_name: 'Jane Golfer',
  customer_phone: '+66891234567',
  customer_email: 'jane@example.com',
  start_date: '2026-07-01',
  end_date: '2026-07-03',
  duration_days: 2,
  delivery_requested: true,
  delivery_address: 'Hotel Bangkok, Sukhumvit',
  delivery_time: '10:00',
  return_time: '18:00',
  sets: [
    { name: 'Callaway Warbird', tier: 'premium', gender: 'mens' },
    { name: 'Majesty Shuttle', tier: 'premium', gender: 'womens' },
  ],
  add_ons: [{ label: 'Golf Glove', price: 600 }],
  total_price: 3500,
  notes: 'Please call on arrival',
  payment_method_chosen: 'online_shopeepay',
  contact_preference: 'line',
  paymentMode: 'online' as const,
};

describe('composeOrderCreatedLineMessage', () => {
  it('keys off the order code and lists every set', () => {
    const msg = composeOrderCreatedLineMessage(base);
    expect(msg).toContain('NEW CLUB RENTAL ORDER (ID: CRO-20260625-AB12)');
    expect(msg).toContain('2 sets in this order');
    expect(msg).toContain("Set 1: Callaway Warbird (Premium, Men's)");
    expect(msg).toContain("Set 2: Majesty Shuttle (Premium, Women's)");
    expect(msg).toContain('💰 Order total: ฿3,500');
    expect(msg).toContain('Add-ons: Golf Glove (฿600)');
    expect(msg).toContain('Delivery to: Hotel Bangkok, Sukhumvit');
  });

  it('shows the online prepay footer when paymentMode is online', () => {
    const msg = composeOrderCreatedLineMessage(base);
    expect(msg).toContain('Awaiting ShopeePay payment');
  });

  it('shows the manual footer + pickup line when paymentMode is manual + pickup', () => {
    const msg = composeOrderCreatedLineMessage({
      ...base,
      delivery_requested: false,
      delivery_address: null,
      paymentMode: 'manual',
    });
    expect(msg).toContain('Please contact the customer');
    expect(msg).toContain('Pickup at LENGOLF');
  });

  it('prefixes [UAT] when requested', () => {
    expect(composeOrderCreatedLineMessage({ ...base, uatPrefix: true })).toMatch(/^\[UAT\] /);
  });
});

describe('composeOrderPaidLineMessage', () => {
  it('shows the order code, all sets, PAID total, and txn ref', () => {
    const msg = composeOrderPaidLineMessage({ ...base, transactionSn: 'SP1234567890' });
    expect(msg).toContain('ORDER PAYMENT RECEIVED (ID: CRO-20260625-AB12)');
    expect(msg).toContain('2 sets in this order');
    expect(msg).toContain('💰 Order total: ฿3,500 (PAID via ShopeePay)');
    expect(msg).toContain('Txn: SP1234567890');
    expect(msg).toContain('Booking confirmed');
  });

  it('omits the txn line when none is provided', () => {
    const msg = composeOrderPaidLineMessage(base);
    expect(msg).not.toContain('Txn:');
  });
});
